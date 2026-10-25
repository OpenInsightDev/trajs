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
 * One step of a session: a prompt, the responses produced together, or an event.
 *
 * **When to use**
 *
 * Use to read a session as the units its parts state: each prompt it was given,
 * the responses produced together, and each event of the run. Use it to display
 * them, to score them, or to hand them to a format that states a run as steps.
 *
 * **Details**
 *
 * A step holds one of the three kinds of part a session runs on, and its `_tag` states
 * which. A {@link PromptStep} holds one request a model was given, with the messages
 * and the moment of that request. A {@link ResponseStep} holds the parts a model
 * produced together, in the order it produced them. An {@link EventStep} holds one
 * happening of the run.
 *
 * Session declarations and metric parts are not steps, and a metric part does not end
 * a run of responses.
 *
 * A step states no ordinal of its own. The steps of a stream are in the order the
 * parts were produced in, so a reader numbers them by their position.
 *
 * @see {@link steps} for the reading that emits them.
 * @category models
 */
export type Step<Config extends Config.AnyConfig> =
  | PromptStep<Config>
  | ResponseStep<Config>
  | EventStep<Config>;

/**
 * A step that holds one request a model was given.
 *
 * @see {@link Step} for the steps a session is read as.
 * @category models
 */
export class PromptStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Prompt")<{
  readonly prompt: Trajectory.PromptPart<Config["extrakit"]>;
}> {}

/**
 * A step that holds the parts a model produced together.
 *
 * @see {@link Step} for the steps a session is read as.
 * @category models
 */
export class ResponseStep<Config extends Config.AnyConfig> extends Data.TaggedClass("Response")<{
  readonly response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}> {}

/**
 * A step that holds one happening of the run.
 *
 * @see {@link Step} for the steps a session is read as.
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
 * Reads the parts of a session as the steps they state.
 *
 * **When to use**
 *
 * Use when a session is to be read by what its parts are: each prompt it was
 * given, the responses produced together, and each event of the run.
 *
 * **Details**
 *
 * The parts are read once, in the order the session holds them. The increments of a
 * streamed response are folded into the parts they complete, and a response part with
 * no completed part of its own is read past.
 *
 * A run of response parts ends at the prompt or the event that follows it, and at the
 * end of the parts. The step of the run is emitted where the run ends, so a step is
 * emitted once the parts that state it are complete.
 *
 * What the stream reads is the parts of one session
 * ({@link Session.SessionStream}), so a trajectory of several sessions is read one
 * session at a time.
 *
 * @see {@link Step} for the steps it emits.
 * @see {@link prompt} for folding the steps back into a prompt.
 * @category combinators
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
 * Reads the parts of a trajectory as the outputs `metric` states of them.
 *
 * **When to use**
 *
 * Use to read what a metric kit produced of a trajectory without knowing the tag the
 * metric parts are carried under, such as to read the estimate a token count states.
 *
 * **Details**
 *
 * Every metric part tagged with `metric` is read as the output it states, in the order
 * the trajectory holds the parts. A part of another metric, or one that states the
 * failure of `metric`, is read past.
 *
 * What the stream reads is the parts of a trajectory, so a session's stream
 * ({@link Session.SessionStream}) reads the metric parts attached to its own parts.
 *
 * @see {@link Metric.Output} for the output it emits.
 * @category combinators
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

export type AttachedMetrics<Config extends Config.AnyConfig> = Stream.Stream<
  Trajectory.MetricPartOf<Config>
>;

export type MetricTrajectoryPart<Config extends Config.AnyConfig> =
  | (AttachablePart<Config> & Readonly<{ metrics: AttachedMetrics<Config> }>)
  | Trajectory.MetricPartOf<Config>;

type AttachablePart<Config extends Config.AnyConfig> =
  | Trajectory.PromptPartOf<Config>
  | Trajectory.SessionPartOf<Config>
  | Trajectory.ResponsePartOf<Config>
  | Trajectory.EventPartOf<Config>;

export type MetricTrajectoryStream<
  Config extends Config.AnyConfig,
  E = never,
  R = never,
> = Stream.Stream<MetricTrajectoryPart<Config>, E, R>;

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
 * Reads the tool calls a session states, in the order it produced them.
 *
 * **When to use**
 *
 * Use when every call a model made is to be read, including one with no result the
 * session holds yet.
 *
 * **Details**
 *
 * A call is read as it is produced rather than paired with the result that answers it,
 * and a call of a tool the toolkit does not describe is read as the part the trajectory
 * holds.
 *
 * @see {@link toolTurns} for the calls that were answered, with their results.
 * @see {@link Response.ToolCallOf} for the call it emits.
 * @category combinators
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

export type ToolTurn<Config extends Config.AnyConfig> = Readonly<{
  call: Response.ToolCallOf<Config>;
  result: Response.ToolResultOf<Config>;
}>;

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
