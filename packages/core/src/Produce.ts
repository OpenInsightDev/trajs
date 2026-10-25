/**
 * Live trajectory production and metric enrichment.
 *
 * {@link produce} provides session writers to an effectful program.
 * {@link fromSession} and {@link fromSessions} accept existing message streams.
 * {@link produceMetrics} adds reports to an existing trajectory.
 *
 * @stability stable
 */

import { Cause, DateTime, Effect, Exit, Function, Queue, Stream } from "effect";

import * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { produceParts } from "#/internal/produce.ts";
import { configOf, uuid } from "#/internal/trajectory.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Tool from "#/Tool.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * Prompt, response, and event parts supplied to trajectory production.
 *
 * **Details**
 *
 * Response parts can contain streaming increments or finished payloads.
 * Session declarations and metric reports are excluded.
 *
 * @see {@link fromSession} for producing a single-session trajectory.
 * @stability stable
 * @category models
 */
export type MessageStream<Config extends Config.AnyConfig, E = never, R = never> = Stream.Stream<
  | Trajectory.PromptPart<Config["extrakit"]>
  | Trajectory.ResponsePart<Config["toolkit"], Config["extrakit"], boolean>
  | Trajectory.EventPart<Config["eventkit"]>,
  E,
  R
>;

/**
 * A session's message stream, parent id, and declaration extras.
 *
 * **Details**
 *
 * `subTo` names the parent session and defaults to the main session.
 * Extra fields sit beside `messages`, not under an `extra` key.
 *
 * @see {@link fromSessions} for declaring and merging sources.
 * @stability stable
 * @category models
 */
export type SessionSource<Config extends Config.AnyConfig, E = never, R = never> = Readonly<{
  messages: MessageStream<Config, E, R>;
  subTo?: string;
}> &
  Extra.ExtraRecord<Config.ExtrasOf<Config>, "session">;

/**
 * Session sources keyed by id, including a required `main` source.
 *
 * **Details**
 *
 * The main source has no parent.
 * Other sources can name a parent through `subTo`.
 *
 * @see {@link SessionSource} for each source's fields.
 * @see {@link fromSessions} for construction and message-id requirements.
 * @stability stable
 * @category models
 */
export type SessionStreams<Config extends Config.AnyConfig, E = never, R = never> = Readonly<{
  main: SessionSource<Config, E, R> & { readonly subTo?: never };
}> &
  Readonly<Record<string, SessionSource<Config, E, R>>>;

/**
 * A production config with a producer for every declared metric.
 *
 * **Details**
 *
 * Production always emits a streaming trajectory, regardless of the supplied `stream` flag.
 * An empty metric kit still needs a producer record.
 *
 * @see {@link MetricKit.toProducers} for supplying that record.
 * @see {@link produce} for running a production program.
 * @stability stable
 * @category configuration
 */
export type ProducingConfig<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
> = Config.Config<boolean, Toolkit, Events, MetricKit.WithProducers<Metrics>, Extras>;

type ProducedConfig<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
> = Config.Config<true, Toolkit, Events, MetricKit.WithProducers<Metrics>, Extras>;

const produced = <
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): ProducedConfig<Toolkit, Events, Metrics, Extras> => Config.config({ ...config, stream: true });

const produceWith =
  <
    Toolkit extends Toolkit.Any,
    Events extends EventKit.Any,
    Metrics extends MetricKit.Any,
    Extras extends ExtraKit.Any,
  >(
    id: string | undefined,
    config: ProducedConfig<Toolkit, Events, Metrics, Extras>,
  ) =>
  <E, R>(
    stream: Trajectory.TrajectoryStream<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
  ) =>
    produceParts(config, config.metrickit)(stream).pipe(Trajectory.make(id ?? uuid(), config));

/**
 * Produces a trajectory from a message stream and the config's metric producers.
 *
 * **When to use**
 *
 * Use when an existing stream already supplies prompt, response, and event parts.
 *
 * **Details**
 *
 * The explicit-id overload keeps that id; the other assigns a new uuid v7.
 * The result uses `stream: true`.
 * Input parts retain their order while metric reports can interleave.
 *
 * **Gotchas**
 *
 * No session declaration is added and no `sessionId` is rewritten.
 * A self-contained single-session input must use the main session or omit `sessionId`.
 * Production broadcasts use unbounded buffers.
 * Slow metric producers can retain an unbounded backlog.
 *
 * @see {@link fromSessions} for declaring several session sources.
 * @see {@link produce} for effectful session writers.
 * @see {@link produceMetrics} for enriching an existing trajectory.
 * @stability stable
 * @category constructors
 */
export function fromSession<
  Id extends string,
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  id: Id,
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): <E, R>(
  stream: MessageStream<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  Id,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function fromSession<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): <E, R>(
  stream: MessageStream<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function fromSession<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  ...args:
    | [id: string, config: ProducingConfig<Toolkit, Events, Metrics, Extras>]
    | [config: ProducingConfig<Toolkit, Events, Metrics, Extras>]
) {
  const [id, config] = args.length === 1 ? [undefined, args[0]] : args;

  return produceWith(id, produced(config));
}

/**
 * Declares session sources and merges their messages with produced metric reports.
 *
 * **When to use**
 *
 * Use when independent streams produce parts for several sessions.
 *
 * **Details**
 *
 * The main declaration appears first, followed by parent-before-child declarations.
 * Each child forks from its parent's declaration, not from a message.
 * All declarations precede messages.
 * Message streams run concurrently with unbounded concurrency.
 * Id assignment and metric production follow {@link fromSession}.
 *
 * **Gotchas**
 *
 * Source keys do not assign `sessionId` to their message parts.
 * Each source must supply parts already naming the correct session.
 * Missing parents and parent cycles fail the trajectory with {@link TrajectoryError}.
 * Cross-session message order depends on arrival order.
 *
 * @see {@link SessionStreams} for the source record.
 * @see {@link produce} for assigning session ids through writers.
 * @stability stable
 * @category constructors
 */
export function fromSessions<
  Id extends string,
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  id: Id,
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): <E, R>(
  sessions: SessionStreams<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  Id,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function fromSessions<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): <E, R>(
  sessions: SessionStreams<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function fromSessions<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  ...args:
    | [id: string, config: ProducingConfig<Toolkit, Events, Metrics, Extras>]
    | [config: ProducingConfig<Toolkit, Events, Metrics, Extras>]
) {
  const [id, config] = args.length === 1 ? [undefined, args[0]] : args;
  const read = produced(config);
  const part = Trajectory.parts(read);

  return <E, R>(
    sessions: SessionStreams<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
  ) => {
    const extraOf = (
      source: SessionSource<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
    ): Extra.ExtraRecord<Extras["extra"], "session"> =>
      Extra.stated(read.extrakit, "session")(source);

    const main = part.mainSession(extraOf(sessions.main));
    const mainId = Trajectory.mainSessionId;

    // A session is declared after the session it is forked from, so the declarations are
    // produced in the order `subTo` states: the main session first, and each session once
    // the session it names is declared, forking from that session's declaration.
    const declarations = [main];
    const declarationOf = new Map([[mainId, main.uuid]]);
    const waiting = new Map(Object.entries(sessions));
    waiting.delete(mainId);

    while (waiting.size > 0) {
      const ready = [...waiting].flatMap(([sessionId, source]) => {
        const fork = declarationOf.get(source.subTo ?? mainId);

        return fork === undefined ? [] : [[sessionId, source, fork] as const];
      });

      // A `subTo` naming a session the record does not state — or sessions naming each
      // other — is a session no declaration of which can be read before another.
      if (ready.length === 0) {
        const [unreachable] = waiting.keys();

        const failed = Stream.fail(
          TrajectoryError.session(unreachable ?? mainId, "unproduced-fork"),
        );

        return produceWith(id, read)(failed);
      }

      for (const [sessionId, source, fork] of ready) {
        const declaration = part.subSession(sessionId, { fork, ...extraOf(source) });

        declarations.push(declaration);
        declarationOf.set(sessionId, declaration.uuid);
        waiting.delete(sessionId);
      }
    }

    const streams = Stream.mergeAll(
      [
        sessions.main.messages,
        ...Object.entries(sessions)
          .filter(([sessionId]) => sessionId !== mainId)
          .map(([, source]) => source.messages),
      ],
      { concurrency: "unbounded" },
    );

    return produceWith(id, read)(Stream.make(...declarations).pipe(Stream.concat(streams)));
  };
}

/**
 * The config a trajectory states once the metrics of `Metrics` are produced of it: the
 * config it is read with, with a metric kit of both.
 */
type WithMetrics<Config extends Config.AnyConfig, Metrics extends MetricKit.Any> = Config.Config<
  Config["stream"],
  Config["toolkit"],
  Config["eventkit"],
  MetricKit.Merged<readonly [Config["metrickit"], Metrics]>,
  Config["extrakit"]
>;

/**
 * Adds newly produced metric reports to an existing trajectory.
 *
 * **When to use**
 *
 * Use to compute additional metrics from recorded parts without rerunning the original program.
 *
 * **Details**
 *
 * Input parts retain their order and values.
 * New reports interleave as their producers emit them.
 * The resulting config merges existing and supplied metric declarations.
 * The result receives a new uuid v7 and preserves the original `stream` flag.
 *
 * **Gotchas**
 *
 * Existing reports are retained, even for metrics being produced again.
 * Supplied declarations replace existing declarations under duplicate tags.
 * A replacement schema must still accept retained reports under that tag.
 * Production broadcasts use unbounded buffers.
 *
 * @see {@link fromSession} for producing metrics alongside a live message stream.
 * @see {@link MetricKit.merge} for declaration and producer retention rules.
 * @stability stable
 * @category metrics
 */
export const produceMetrics: {
  <Metrics extends MetricKit.Any>(
    metrickit: MetricKit.WithProducers<Metrics>,
  ): <Config extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<string, Config, E, R>,
  ) => Trajectory.Trajectory<string, WithMetrics<Config, Metrics>, E | TrajectoryError, R>;
  <Config extends Config.AnyConfig, Metrics extends MetricKit.Any, E, R>(
    trajectory: Trajectory.Trajectory<string, Config, E, R>,
    metrickit: MetricKit.WithProducers<Metrics>,
  ): Trajectory.Trajectory<string, WithMetrics<Config, Metrics>, E | TrajectoryError, R>;
} = Function.dual(
  2,
  <Config extends Config.AnyConfig, Metrics extends MetricKit.Any, E, R>(
    trajectory: Trajectory.Trajectory<string, Config, E, R>,
    metrickit: MetricKit.WithProducers<Metrics>,
  ): Trajectory.Trajectory<string, WithMetrics<Config, Metrics>, E | TrajectoryError, R> => {
    const stated = configOf(trajectory);

    const config: WithMetrics<Config, Metrics> = {
      ...stated,
      // SAFETY: `merge` answers with the kit the kits given make, which is the kit `Merged`
      // reads them as.
      metrickit: MetricKit.merge(stated.metrickit, metrickit) as MetricKit.Merged<
        readonly [Config["metrickit"], Metrics]
      >,
    };

    // SAFETY: a part of the trajectory given is a part of the one that states the metrics of
    // its own kit and the ones added beside them, which is the config stated above.
    const given = trajectory as Trajectory.TrajectoryStream<WithMetrics<Config, Metrics>, E, R>;

    return given.pipe(produceParts(config, metrickit), Trajectory.make(config));
  },
);

/** The span `startTimestamp` begins runs to `timestamp`. */
type Moments = {
  readonly timestamp?: DateTime.Utc;
  readonly startTimestamp?: DateTime.Utc;
};

/**
 * A session writer assigning session ids and queuing trajectory parts.
 *
 * **Details**
 *
 * Enqueue operations return the constructed part, including its uuid.
 * Extras sit beside timing options, not under an `extra` key.
 * An omitted prompt timestamp stays absent.
 * Responses and events receive the current time when their timestamp is omitted.
 *
 * @see {@link produce} for the writer's lifetime.
 * @stability stable
 * @category models
 */
export type ProduceSession<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
> = Readonly<{
  id: string;
  enqueuePrompt: (
    message: Prompt.Prompt,
    options?: Extra.ExtraRecord<Extras, "prompt"> & Moments,
  ) => Effect.Effect<Trajectory.PromptPart<ExtraKit.ExtraKit<Extras>>>;
  enqueueResponse: (
    response: Response.AllPartsView<Tools>,
    options?: Extra.ExtraRecord<Extras, "response"> & Moments,
  ) => Effect.Effect<
    Trajectory.ResponsePart<Toolkit.Toolkit<Tools>, ExtraKit.ExtraKit<Extras>, true>
  >;
  enqueueEvent: (
    event: Event.EventParts<Events>,
    options?: Moments,
  ) => Effect.Effect<Trajectory.EventPart<EventKit.EventKit<Events>>>;
  /**
   * Declares a child writer from an already enqueued fork target.
   *
   * **Details**
   *
   * An omitted `fork` uses this writer's session declaration.
   * An explicit fork can name any earlier prompt, response, or declaration in the production run.
   *
   * **Gotchas**
   *
   * Duplicate session ids and unknown fork targets fail with {@link TrajectoryError}.
   * Events cannot serve as fork targets.
   * A declaration fork inherits no parent messages.
   */
  forkSession: (
    options: { id: string; fork?: string } & Extra.ExtraRecord<Extras, "session">,
  ) => Effect.Effect<ProduceSession<Tools, Events, Extras>, TrajectoryError>;
}>;

type ProduceFn<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
  E = never,
  R = never,
> = (main: ProduceSession<Tools, Events, Extras>) => Effect.Effect<void, E, R>;

/**
 * Runs an effectful program with a main-session writer and emits its trajectory.
 *
 * **When to use**
 *
 * Use when application effects produce messages, responses, events, or forked sessions during a run.
 *
 * **Details**
 *
 * The main session is declared before the callback runs.
 * Declared session extras are read beside the config and attached to that declaration.
 * The explicit-id overload keeps that id; the other assigns a new uuid v7.
 * The output uses `stream: true` and includes the config's produced metric reports.
 * Callback failure fails the trajectory.
 *
 * **Gotchas**
 *
 * The callback runs when the trajectory is consumed, not when it is constructed.
 * Replaying the uncached trajectory runs the callback again.
 * Writers are valid only during that callback's run.
 * The writer queue and metric broadcasts are unbounded.
 * A producer faster than its consumers can retain an unbounded backlog.
 *
 * **Example** (Forking after a recorded prompt)
 *
 * ```ts import.meta.vitest
 * import { Config, MetricKit, Produce, Prompt } from "@trajs/core"
 * import { Effect, Stream } from "effect"
 *
 * const config = Config.config({ metrickit: MetricKit.toProducers(MetricKit.empty, {}) })
 * const trajectory = Produce.produce("run-1", config)((main) => Effect.gen(function* () {
 *   const prompt = yield* main.enqueuePrompt(Prompt.make("Investigate"))
 *   const child = yield* main.forkSession({ id: "worker", fork: prompt.uuid })
 *   yield* child.enqueuePrompt(Prompt.make("Check the logs"))
 * }))
 *
 * await Effect.runPromise(trajectory.pipe(Stream.runCount)) // => 4
 * ```
 *
 * @see {@link ProduceSession} for writer operations.
 * @see {@link fromSessions} for merging existing session streams.
 * @stability stable
 * @category constructors
 */
export function produce<
  Id extends string,
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  id: Id,
  config: ProducingConfig<Toolkit, Events, Metrics, Extras> &
    Extra.ExtraRecord<Extras["extra"], "session">,
): <E, R>(
  fn: ProduceFn<Toolkit["tools"], Events["events"], Extras["extra"], E, R>,
) => Trajectory.Trajectory<
  Id,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function produce<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras> &
    Extra.ExtraRecord<Extras["extra"], "session">,
): <E, R>(
  fn: ProduceFn<Toolkit["tools"], Events["events"], Extras["extra"], E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
>;
export function produce<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  ...args:
    | [
        id: string,
        config: ProducingConfig<Toolkit, Events, Metrics, Extras> &
          Extra.ExtraRecord<Extras["extra"], "session">,
      ]
    | [
        config: ProducingConfig<Toolkit, Events, Metrics, Extras> &
          Extra.ExtraRecord<Extras["extra"], "session">,
      ]
): <E, R>(
  fn: ProduceFn<Toolkit["tools"], Events["events"], Extras["extra"], E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
> {
  const [id, config] = args.length === 1 ? [undefined, args[0]] : args;
  const read = produced(config);
  const part = Trajectory.parts(read);

  // The extra data the kit declares of a session part is stated beside the config, and is
  // declared with the main session: the one the program is handed.
  const sessionExtra = Extra.stated(read.extrakit, "session")(config);

  return (fn) => {
    // The queue only ever ends rather than fails — a run that fails fails the
    // trajectory through the fork — so its failure type is the end alone.
    const trajectory = Effect.gen(function* () {
      const parts = yield* Queue.unbounded<
        Trajectory.Part<ProducedConfig<Toolkit, Events, Metrics, Extras>>,
        Cause.Done
      >();

      const declared = new Set<string>();
      const forkable = new Set<string>();

      const enqueue = <
        P extends Trajectory.Part<ProducedConfig<Toolkit, Events, Metrics, Extras>> & {
          readonly uuid: string;
        },
      >(
        written: P,
      ): Effect.Effect<P> =>
        Effect.gen(function* () {
          yield* Queue.offer(parts, written);

          // A `fork` names a part a session continues from, so an event is written
          // without being remembered to fork from.
          if (written._tag !== "Event") {
            forkable.add(written.uuid);
          }

          return written;
        });

      const mainDeclaration = part.mainSession(sessionExtra);

      const session = (
        stated: string | undefined,
        declaration: string,
      ): ProduceSession<Toolkit["tools"], Events["events"], Extras["extra"]> => ({
        id: stated ?? Trajectory.mainSessionId,
        enqueuePrompt: (prompt, { timestamp, startTimestamp, ...extra } = {}) =>
          enqueue(part.prompt(prompt, { sessionId: stated, timestamp, startTimestamp, ...extra })),
        enqueueResponse: (response, { timestamp, startTimestamp, ...extra } = {}) =>
          enqueue(
            part.response(response, { sessionId: stated, timestamp, startTimestamp, ...extra }),
          ),
        enqueueEvent: (event, { timestamp, startTimestamp } = {}) =>
          enqueue(part.event(event, { sessionId: stated, timestamp, startTimestamp })),
        forkSession: ({ id: sessionId, fork, ...extra }) =>
          Effect.gen(function* () {
            // A session is declared before the parts it produces, so a declaration of
            // an id a session was opened under already is read after the parts of that
            // session.
            if (declared.has(sessionId)) {
              return yield* Effect.fail(TrajectoryError.session(sessionId, "late-declaration"));
            }

            // A `fork` names a part a session continues from: the declaration of this
            // session where none is stated, and otherwise a part the run wrote as one.
            const continuing = fork ?? declaration;

            if (!forkable.has(continuing)) {
              return yield* Effect.fail(TrajectoryError.session(sessionId, "unproduced-fork"));
            }

            declared.add(sessionId);

            const extraData = Extra.stated(read.extrakit, "session")(extra);

            const opened = yield* enqueue(
              part.subSession(sessionId, { fork: continuing, ...extraData }),
            );

            return session(sessionId, opened.uuid);
          }),
      });

      // The main session is declared before the program runs, so every part it writes is
      // read in a session the trajectory already names.
      yield* enqueue(mainDeclaration);
      declared.add(Trajectory.mainSessionId);

      const program = fn(session(undefined, mainDeclaration.uuid)).pipe(
        Effect.onExit((exit) =>
          Exit.isSuccess(exit) ? Queue.end(parts).pipe(Effect.asVoid) : Effect.void,
        ),
        Stream.fromEffectDrain,
      );

      return Stream.fromQueue(parts).pipe(Stream.drainFork(program));
    });

    return produceWith(id, read)(trajectory.pipe(Stream.unwrap));
  };
}
