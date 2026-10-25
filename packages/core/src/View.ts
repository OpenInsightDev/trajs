/**
 * Conversation steps, tool turns, and metric views over trajectory parts.
 *
 * {@link steps} groups one session's responses and {@link prompt} reconstructs its conversation.
 * {@link metricTrajectory} exposes reports through streams attached to their target parts.
 *
 * @stability stable
 */

import { Data, Effect, Result, Stream } from "effect";
import { Prompt } from "effect/ai";

import * as Config from "#/Config.ts";
import { foldResponse } from "#/internal/folding.ts";
import { attachment, attachPart, endAttachment, idle, type Run } from "#/internal/view.ts";
import type * as Metric from "#/Metric.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";

type Tools<Config extends Config.AnyConfig> = Config["toolkit"]["tools"];

/**
 * Reconstructs a prompt from a session's messages and finished responses.
 *
 * **When to use**
 *
 * Use to build conversation context for another model call.
 *
 * **Details**
 *
 * Prompt messages retain their order.
 * Response steps become messages through {@link Prompt.fromResponseParts}.
 * Events and metric reports add no messages.
 *
 * **Gotchas**
 *
 * The entire conversation is retained until the input ends.
 * An infinite session never returns a prompt.
 *
 * @see {@link steps} for incremental step access and response-folding limits.
 * @see {@link Session.stream} for including inherited context.
 * @stability stable
 * @category converting
 */
export const prompt = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E, R> =>
  steps(stream).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (folded, step) =>
        folded.pipe(
          Prompt.concat(Prompt.fromMessages(step._tag === "Prompt" ? step.prompt.messages : [])),
          Prompt.concat(Prompt.fromResponseParts(step._tag === "Response" ? step.response : [])),
        ),
    ),
  );

/**
 * A prompt, a completed response group, or an event from one session.
 *
 * **Details**
 *
 * Steps have no ordinal.
 * Session declarations and metric reports do not become steps.
 *
 * @see {@link steps} for grouping and emission rules.
 * @stability stable
 * @category models
 */
export type Step<Config extends Config.AnyConfig> =
  | PromptStep<Config>
  | ResponseStep<Config>
  | EventStep<Config>;

/**
 * A prompt part retaining its messages, extras, and timing.
 *
 * @see {@link Step} for all step variants.
 * @stability stable
 * @category models
 */
export class PromptStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Prompt")<{
  readonly prompt: Trajectory.PromptPart<Config["extrakit"]>;
}> {}

/**
 * Finished response payloads grouped between prompts or events.
 *
 * **Gotchas**
 *
 * The group does not retain trajectory part uuids, timestamps, or extras.
 *
 * @see {@link steps} for group boundaries and folding.
 * @stability stable
 * @category models
 */
export class ResponseStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Response")<{
  readonly response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}> {}

/**
 * An event part retaining its payload, uuid, and timing.
 *
 * @see {@link Step} for all step variants.
 * @stability stable
 * @category models
 */
export class EventStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Event")<{
  readonly event: Trajectory.EventPart<Config["eventkit"]>;
}> {}

/** The step a run states, where it produced any part. */
const stepsOf = <Config extends Config.AnyConfig>(
  run: Run<Tools<Config>>,
): ReadonlyArray<Step<Config>> =>
  run.response.length === 0 ? [] : [new ResponseStep<Config>({ response: run.response })];

const assembleStep = <Config extends Config.AnyConfig>(
  run: Run<Tools<Config>>,
  part: Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
): readonly [Run<Tools<Config>>, ReadonlyArray<Step<Config>>] => {
  switch (part._tag) {
    case "Prompt":
      // A prompt ends the run of responses before it, and opens a folding of its own.
      return [idle<Tools<Config>>(), [...stepsOf(run), new PromptStep<Config>({ prompt: part })]];

    case "Event":
      // An event ends the run of responses before it.
      // Open text and reasoning stay open.
      return [
        { response: [], folding: run.folding },
        [...stepsOf(run), new EventStep<Config>({ event: part })],
      ];

    case "Response": {
      const [folding, folded] = foldResponse(
        run.folding,
        part.sessionId ?? Trajectory.mainSessionId,
        part.response,
      );

      return [{ response: [...run.response, ...folded], folding }, []];
    }

    default:
      return [run, []];
  }
};

/**
 * Groups one session's parts into prompt, response, and event steps.
 *
 * **When to use**
 *
 * Use when displaying or converting a conversation by turn rather than by individual response increments.
 *
 * **Details**
 *
 * A prompt or event closes the current response group.
 * End of input also emits the remaining group.
 * Metric reports do not close a group.
 * Text and reasoning increments become finished parts at their matching end markers.
 *
 * **Gotchas**
 *
 * Input must contain only one session.
 * Tool parameter increments and response error payloads are omitted.
 * Unfinished text and reasoning are not emitted at end of input.
 * A new prompt discards open increments; an event leaves them open.
 * The current response group remains in memory until its boundary.
 *
 * @see {@link Step} for the output variants.
 * @see {@link prompt} for collecting the conversation into a prompt.
 * @stability stable
 * @category transforming
 */
export const steps = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<Step<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(idle<Tools<Config>>, assembleStep<Config>, {
      // The run the parts end in has no prompt or event after it to close it, so the parts
      // ending is what closes it.
      onHalt: stepsOf,
    }),
  );

/**
 * Selects successful reports for one metric in input order.
 *
 * **When to use**
 *
 * Use to consume a metric's outputs without matching its tag manually.
 *
 * **Details**
 *
 * Reports from other metrics and failure reports are omitted.
 * Values are selected by tag without schema validation.
 *
 * @see {@link Metric.Output} for timing and attachment fields.
 * @stability stable
 * @category filtering
 */
export const produced =
  <Ext extends Metric.Any>(metric: Ext) =>
  <Config extends Config.AnyConfig, E, R>(
    stream: Stream.Stream<Trajectory.Part<Config>, E, R>,
  ): Stream.Stream<Metric.Output<Ext>, E, R> =>
    stream.pipe(
      Stream.filterMap((part) => {
        if (
          part._tag !== "Metric" ||
          part.metric._tag !== metric.tag ||
          part.metric.data._tag !== "Output"
        ) {
          return Result.failVoid;
        }

        // SAFETY: the metric part is tagged with `metric.tag`, so its output is that metric's.
        return Result.succeed(part.metric.data as Metric.Output<Ext>);
      }),
    );

/**
 * Reports attached to one part, including reports already encountered during the outer reading.
 *
 * @see {@link metricTrajectory} for lifetime and consumption rules.
 * @stability stable
 * @category models
 */
export type AttachedMetrics<Config extends Config.AnyConfig> = Stream.Stream<
  Trajectory.MetricPartOf<Config>
>;

/**
 * A part with an attached report stream, or an unattached metric part.
 *
 * @see {@link metricTrajectory} for routing reports to target parts.
 * @stability stable
 * @category models
 */
export type MetricTrajectoryPart<Config extends Config.AnyConfig> =
  | (AttachablePart<Config> & Readonly<{ metrics: AttachedMetrics<Config> }>)
  | Trajectory.MetricPartOf<Config>;

type AttachablePart<Config extends Config.AnyConfig> =
  | Trajectory.PromptPartOf<Config>
  | Trajectory.SessionPartOf<Config>
  | Trajectory.ResponsePartOf<Config>
  | Trajectory.EventPartOf<Config>;

/**
 * A trajectory view exposing attached report streams on non-metric parts.
 *
 * @see {@link MetricTrajectoryPart} for each emitted value.
 * @see {@link metricTrajectory} for construction.
 * @stability stable
 * @category models
 */
export type MetricTrajectoryStream<
  Config extends Config.AnyConfig,
  E = never,
  R = never,
> = Stream.Stream<MetricTrajectoryPart<Config>, E, R>;

/**
 * Routes attached metric reports into streams on their target parts.
 *
 * **When to use**
 *
 * Use to display a part before all its metric reports arrive.
 *
 * **Details**
 *
 * Non-metric parts gain a `metrics` stream keyed by their uuid.
 * Reports without `attach` remain in the outer stream.
 * Reports with `attach` leave the outer stream and enter each named target's stream.
 * Repeated target ids within one report are deduplicated.
 * Inner streams replay encountered reports and close when the outer stream ends.
 *
 * **Gotchas**
 *
 * Keep consuming the outer stream while reading inner streams.
 * Waiting for an inner stream to end inside a sequential outer read can stall indefinitely.
 * Attachments match part uuids only, not session ids.
 * Unknown targets do not fail and produce no outer report.
 * Attachment state retains encountered reports without a capacity limit.
 * Inner streams close without propagating the outer stream's error.
 *
 * @see {@link produced} for selecting metric outputs directly.
 * @stability stable
 * @category transforming
 */
export const metricTrajectory = <Config extends Config.AnyConfig, E, R>(
  stream: Trajectory.TrajectoryStream<Config, E, R>,
): MetricTrajectoryStream<Config, E, R> =>
  Stream.suspend(() => {
    const attached = attachment<Config>();

    return stream.pipe(
      Stream.mapAccumEffect(() => attached, attachPart<Config>),
      Stream.onExit(() => endAttachment(attached)),
    );
  });

/**
 * Selects tool calls from response parts in session order.
 *
 * **When to use**
 *
 * Use when unanswered calls must remain visible.
 *
 * **Details**
 *
 * Calls to undeclared tools are included.
 * Tool calls inside prompt messages are not inspected.
 *
 * @see {@link toolTurns} for pairing calls with final results.
 * @see {@link Response.ToolCallOf} for the emitted call type.
 * @stability stable
 * @category filtering
 */
export const toolCalls = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<Response.ToolCallOf<Config>, E, R> =>
  stream.pipe(
    Stream.filterMap((part) =>
      part._tag === "Response" && part.response.type === "tool-call"
        ? Result.succeed(part.response)
        : Result.failVoid,
    ),
  );

/**
 * A response tool call paired with its final result by call id.
 *
 * @see {@link toolTurns} for pairing rules.
 * @stability stable
 * @category models
 */
export type ToolTurn<Config extends Config.AnyConfig> = Readonly<{
  call: Response.ToolCallOf<Config>;
  result: Response.ToolResultOf<Config>;
}>;

/**
 * Pairs response tool calls with final results in result-arrival order.
 *
 * **Details**
 *
 * Calls are remembered by id until a non-preliminary result arrives.
 * A matching final result emits one pair and removes the remembered call.
 *
 * **Gotchas**
 *
 * Preliminary results and results without a preceding call are omitted.
 * Reusing an unanswered call id replaces its earlier call.
 * Unanswered calls remain in memory until the input ends and emit no pair.
 * Prompt messages are not inspected for calls or results.
 *
 * @see {@link toolCalls} for calls without requiring results.
 * @see {@link ToolTurn} for the emitted pair.
 * @stability stable
 * @category transforming
 */
export const toolTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(
      () => new Map<string, Response.ToolCallPartsView<Tools<Config>>>(),
      (calls, part) => {
        if (part._tag !== "Response") return [calls, []];

        const response = part.response;

        switch (response.type) {
          case "tool-call":
            calls.set(response.id, response);

            return [calls, []];
          case "tool-result": {
            if (response.preliminary) return [calls, []];

            const call = calls.get(response.id);

            if (call === undefined) return [calls, []];

            calls.delete(response.id);

            return [calls, [{ call, result: response }]];
          }

          default:
            return [calls, []];
        }
      },
    ),
  );
