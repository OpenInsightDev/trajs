/**
 * Conversation steps, tool turns, and metric views over trajectory parts.
 *
 * {@link steps} groups one session's responses and {@link prompt} reconstructs its conversation.
 * {@link metricTrajectory} attaches reports to the parts they name.
 *
 * @stability stable
 */

import { Data, Effect, Match, Predicate, Result, Stream } from "effect";
import { Prompt } from "effect/ai";

import * as Cache from "#/Cache.ts";
import * as Config from "#/Config.ts";
import { idle, metricStream, type Run } from "#/internal/view.ts";
import type * as Metric from "#/Metric.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

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
 * @see {@link steps} for incremental step access.
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
        Match.valueTags(step, {
          Prompt: ({ prompt }) => folded.pipe(Prompt.concat(Prompt.fromMessages(prompt.messages))),
          Response: ({ response }) =>
            folded.pipe(Prompt.concat(Prompt.fromResponseParts(response))),
          Event: () => folded,
        }),
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
 * @see {@link steps} for group boundaries.
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

/** The responses a part leaves open, and the steps it closed. */
type Assembly<Config extends Config.AnyConfig> = readonly [
  Run<Tools<Config>>,
  ReadonlyArray<Step<Config>>,
];

const assembleStep = <Config extends Config.AnyConfig>(
  run: Run<Tools<Config>>,
  part: Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
): Assembly<Config> =>
  Match.value(part).pipe(
    // A prompt ends the run of responses before it.
    Match.tag("Prompt", (prompt): Assembly<Config> => [
      idle<Tools<Config>>(),
      [...stepsOf(run), new PromptStep<Config>({ prompt })],
    ]),
    // An event ends the run of responses before it.
    Match.tag("Event", (event): Assembly<Config> => [
      idle<Tools<Config>>(),
      [...stepsOf(run), new EventStep<Config>({ event })],
    ]),
    Match.tag("Response", (response): Assembly<Config> => [
      { response: [...run.response, response.response] },
      [],
    ]),
    // A report names a part of an earlier step, so it neither starts nor ends one.
    Match.tag("Metric", (): Assembly<Config> => [run, []]),
    Match.exhaustive,
  );

/**
 * Groups one session's parts into prompt, response, and event steps.
 *
 * **When to use**
 *
 * Use when displaying or converting a conversation by turn rather than by individual response parts.
 *
 * **Details**
 *
 * A prompt or event closes the current response group.
 * End of input also emits the remaining group.
 * Metric reports do not close a group.
 *
 * **Gotchas**
 *
 * Input must contain only one session.
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
          !Predicate.isTagged("Metric")(part) ||
          part.metric._tag !== metric.tag ||
          !Predicate.isTagged("Output")(part.metric.data)
        ) {
          return Result.failVoid;
        }

        // SAFETY: the metric part is tagged with `metric.tag`, so its output is that metric's.
        return Result.succeed(part.metric.data as Metric.Output<Ext>);
      }),
    );

/**
 * The metric part of the metric `Tag` names, carrying that metric's payload.
 */
type ReportOf<Config extends Config.AnyConfig, Tag extends keyof Config.MetricsOf<Config>> = Omit<
  Trajectory.MetricPartOf<Config>,
  "metric"
> &
  Readonly<{
    metric: Extract<Trajectory.MetricPartOf<Config>["metric"], { readonly _tag: Tag }>;
  }>;

/**
 * The reports attached to one part, keyed by metric tag, each list in trajectory order.
 *
 * **Details**
 *
 * A key is present only for a metric that reported on the part.
 * Each list holds the reports of the metric of that tag.
 *
 * @see {@link metricTrajectory} for how reports reach a part.
 * @stability stable
 * @category models
 */
export type AttachedMetrics<Config extends Config.AnyConfig> = Readonly<{
  [Tag in keyof Config.MetricsOf<Config>]?: ReadonlyArray<ReportOf<Config, Tag>>;
}>;

/**
 * A part with the reports attached to it, or a report without attachments.
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
 * A trajectory view carrying the reports attached to each part.
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
 * Reads a trajectory into parts carrying the reports attached to them.
 *
 * **When to use**
 *
 * Use to display a part together with the reports that name it.
 *
 * **Details**
 *
 * {@link Cache.Cache} reads the trajectory to completion before any part is emitted.
 * A scan of the cached parts indexes each report by the uuid of the parts it names.
 * A non-metric part carries `metrics`, a record from metric tag to the reports naming its uuid.
 * Reading one metric's reports needs only `metrics[tag]`.
 * Reports without `attach` remain in the stream.
 * Reports with `attach` leave the stream for the `metrics` of the parts they name.
 * Repeated target ids within one report attach once.
 *
 * **Gotchas**
 *
 * The entire trajectory is read before the first part is emitted.
 * An infinite trajectory never emits.
 * Attachments match part uuids only, not session ids.
 * An unknown target attaches nothing.
 * Reading requires the cache's backing store to remain available.
 *
 * @see {@link produced} for selecting metric outputs directly.
 * @see {@link Cache.Cache} for the service the reading runs in.
 * @stability stable
 * @category transforming
 */
export const metricTrajectory = Effect.fn(function* <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.fn.Return<
  MetricTrajectoryStream<
    Config,
    TrajectoryError | Cache.CacheError,
    Config.DecodingServices<Config>
  >,
  E | TrajectoryError | Cache.CacheError,
  R | Cache.Cache | Config.SchemaServices<Config>
> {
  const cache = yield* Cache.Cache;
  const cached = yield* cache.cache(trajectory);

  return yield* metricStream(cached);
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
      Predicate.isTagged("Response")(part) && part.response.type === "tool-call"
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
        if (!Predicate.isTagged("Response")(part)) return [calls, []];

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
