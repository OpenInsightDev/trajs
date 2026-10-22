/**
 * Producing what a program does with a model as a trajectory.
 *
 * {@link fromSession} produces the parts of a session that is already a stream as a
 * trajectory, {@link fromSessions} produces the streams of several sessions as one,
 * and {@link produce} produces a run as it happens. Each is named by the id it is
 * given, or by a new uuid ({@link Trajectory}), and runs the producers of the
 * metric kit over what it produces, so what a kit derives of a trajectory is produced
 * among the parts it is about.
 */

import { Cause, DateTime, Effect, Exit, Queue, Stream } from "effect";

import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { uuid } from "#/internal/trajectory.ts";
import * as Metric from "#/Metric.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Tool from "#/Tool.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The messages a session produces, as one stream: the prompts a model was given, the
 * responses it returned, and the events a kit produced of the session.
 *
 * **When to use**
 *
 * Use to type what {@link fromSession} produces, or the messages {@link SessionSource}
 * states of a session.
 *
 * **Details**
 *
 * A part is stated as the trajectory produces it, so a stream of them holds the parts
 * themselves rather than the messages they were built from. A session declaration is
 * not among them: each part states the session it was produced in, and a part of the
 * main session states none. So what a stream states is read in the session it names,
 * and that session is read from a declaration of the trajectory it is produced as
 * ({@link fromSessions} declares one per stream; {@link fromSession} declares none).
 * - A response part is of either variant: a program that streams produces the
 *   increments an answer arrives in, and one that answers whole produces the parts a
 *   model returned, and the trajectory those parts make holds both
 *   ({@link Trajectory.Part}).
 *
 * @see {@link fromSession} for the function that produces them.
 * @see {@link SessionSource} for what one session is produced from.
 * @category models
 */
export type MessageStream<
  Config extends Trajectory.AnyConfig,
  E = never,
  R = never,
> = Stream.Stream<
  | Trajectory.PromptPart<Config["extrakit"]>
  | Trajectory.ResponsePart<Config["toolkit"], Config["extrakit"], boolean>
  | Trajectory.EventPart<Config["eventkit"]>,
  E,
  R
>;

/**
 * What one session of a trajectory is produced from: the messages the session produces,
 * and the session it is forked from.
 *
 * **When to use**
 *
 * Use to type one session of what {@link fromSessions} is given, or to state a session
 * of its own beside the ones a trajectory is produced from.
 *
 * **Details**
 *
 * - `messages` are the messages the session produces, as {@link MessageStream} reads
 *   them: each states the session it was produced in, and a part of the main session
 *   states none.
 * - `subTo` is the id of the session the stream is forked from, and is the main session
 *   where none is stated. The session is declared after the one it names, from that
 *   session's declaration, so it holds none of its messages
 *   ({@link Trajectory.SessionPart}).
 * - What the entry states beside `messages` and `subTo` is the extra data the kit declares
 *   of a session part, declared with the session it names ({@link Extra.ExtraRecord}).
 *
 * @see {@link SessionStreams} for the record it is an entry of.
 * @see {@link fromSessions} for the function that produces them.
 * @category models
 */
export type SessionSource<Config extends Trajectory.AnyConfig, E = never, R = never> = Readonly<{
  messages: MessageStream<Config, E, R>;
  subTo?: string;
}> &
  Extra.ExtraRecord<Config["extrakit"]["extra"], "session">;

/**
 * The sessions a trajectory is produced from, and what each of them is produced from.
 *
 * **When to use**
 *
 * Use to type what {@link fromSessions} is given, or to state the sessions a trajectory
 * is produced from.
 *
 * **Details**
 *
 * - The record is keyed by session, and every key is an entry of {@link SessionSource}.
 *   `main` is the main session, which is stated whether or not it produces a message:
 *   every trajectory is of a main session, so the record names it — and since it is
 *   forked from nothing, it states no `subTo`.
 * - Every other key names a session of its own, which is declared before the messages
 *   of its stream arrive, however few of them it gives ({@link SessionSource}). The
 *   extra data an entry states is declared with the session it names, the main session
 *   among them.
 * - The declarations are produced in the order `subTo` states: the main session first,
 *   then each session once the session it is forked from is declared — the sessions
 *   forked from one session following the order the record states them.
 *
 * @see {@link SessionSource} for one session of the record.
 * @see {@link fromSessions} for the function that produces them.
 * @category models
 */
export type SessionStreams<Config extends Trajectory.AnyConfig, E = never, R = never> = Readonly<{
  main: SessionSource<Config, E, R> & { readonly subTo?: never };
}> &
  Readonly<Record<string, SessionSource<Config, E, R>>>;

/**
 * What a trajectory is produced with: the config it is read with, whose metric kit states
 * the producer of each of its metrics.
 *
 * **When to use**
 *
 * Use to type what {@link fromSession}, {@link fromSessions} and {@link produce} are
 * given, or to state one config a trajectory is both produced and read with.
 *
 * **Details**
 *
 * - It is a {@link Trajectory.Config}, so what a program produces carries it: the
 *   trajectory produced is read with the very config it was produced with, rather than
 *   with a record of its own stating the same kits.
 * - `metrickit` is a kit provided with its producers
 *   ({@link MetricKit.WithProducers}), since what a kit derives of a trajectory is
 *   produced among the parts it is about; every other field is the config's own.
 * - `stream` states nothing of what is produced: the parts a program produces are the
 *   ones that arrive, the increments of a streamed answer among them, so a trajectory
 *   produced is read with streams whatever the config given states
 *   ({@link fromSession}).
 * - {@link produce} writes the declaration of the main session itself, so it is given the
 *   extra data the kit declares of a session part beside the config: a key of it the kit
 *   declares for a session part is the data declared with that session
 *   ({@link Extra.ExtraRecord}), and every other field is the config's. {@link fromSessions}
 *   declares its sessions from the record, which states each session's extra there.
 *
 * @see {@link MetricKit.toProducers} for providing a kit with the producers of its
 * metrics.
 * @see {@link Trajectory.Config} for the config it is.
 * @category models
 */
export type ProducingConfig<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
> = Trajectory.Config<boolean, Toolkit, Events, MetricKit.WithProducers<Metrics>, Extras>;

/**
 * The config a trajectory produced here is read with: the kits given, and response parts
 * of the increments they arrive in.
 */
type ProducedConfig<
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
> = Trajectory.Config<true, Toolkit, Events, MetricKit.WithProducers<Metrics>, Extras>;

/**
 * The config a trajectory is produced and read with: what it was given, with the variant
 * turned on — the parts a program produces are the increments an answer arrives in.
 */
const produced = <
  Toolkit extends Toolkit.Any,
  Events extends EventKit.Any,
  Metrics extends MetricKit.Any,
  Extras extends ExtraKit.Any,
>(
  config: ProducingConfig<Toolkit, Events, Metrics, Extras>,
): ProducedConfig<Toolkit, Events, Metrics, Extras> =>
  Trajectory.config({ ...config, stream: true });

/**
 * Every trajectory this module makes is of parts that were already read — the parts of
 * one session that is a stream, of several such sessions, and the parts a run
 * enqueued — so what a trajectory is of the id and config given, and how what a kit
 * derives of it is produced among its parts, is stated here once. A trajectory no id is
 * given for is named by a new uuid ({@link Trajectory}).
 */
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
  ): Trajectory.Trajectory<
    string,
    ProducedConfig<Toolkit, Events, Metrics, Extras>,
    E | TrajectoryError,
    R
  > => {
    const parts = Trajectory.parts(config);

    return stream.pipe(
      // The trajectory is read twice — as the parts of the trajectory, and by the
      // producers the metric kit runs over it — so one subscription is shared
      // between the two readings rather than the producer behind them, which may drive a
      // model, being run twice.
      Stream.broadcastN({ n: 2, capacity: "unbounded" }),
      Effect.map(([produced, producing]) =>
        Stream.merge(
          produced,
          producing.pipe(
            // The config here streams, and a producer reads whole parts:
            // `Metric.produce` folds the increments before a producer reads them.
            Metric.produce(config.metrickit),
            // What a kit derived is produced as the part of an event-less kind it is,
            // built the way every part of the trajectory is.
            Stream.map((metric) => parts.metric(metric)),
          ),
        ),
      ),
      Stream.unwrap,
      Trajectory.make(id ?? uuid(), config),
    );
  };

/**
 * Produces the parts of a session as a trajectory, with the metric parts a kit
 * derives of them.
 *
 * **When to use**
 *
 * Use when what a model was given and returned is already a stream of parts and it
 * should read as a trajectory rather than as the parts it holds.
 *
 * **Details**
 *
 * - The trajectory's own terms are bound first, as every constructor of this module
 *   states them: `fromSession(id, config)` and `fromSession(config)` both return the
 *   function the parts are produced from, so the id given names the trajectory produced
 *   and a call stating none names it by a new uuid ({@link Trajectory}).
 * - Each part is produced as it arrives, in the order the stream gives it, and the
 *   trajectory carries the config given: the kits it names are the ones its parts are
 *   read with, and the producers it states are the ones run.
 * - The response parts of the config given state nothing of what is produced: the
 *   trajectory produced is read with streams, since the parts a program produces are
 *   the increments an answer arrives in ({@link ProducingConfig}).
 * - A stream holds no declaration ({@link MessageStream}), so what it produces is read in
 *   the sessions its parts name: a part that states no session of its own — or states
 *   `"main"` — is of the main session, which a trajectory reads without a declaration,
 *   while a part that names a session of its own names one this reading declares
 *   nowhere ({@link fromSessions} declares the sessions of a record before they arrive).
 * - The producers the metric kit was provided with are run over the same parts as
 *   they arrive, exactly as {@link Metric.produce} runs them, and the metric parts
 *   they derive are produced among the parts they are about. The stream is read once,
 *   so a stream that drives a model is not run twice.
 * - The failure a producer reports is produced as the failure of its metric rather
 *   than failing the trajectory; a failure of the run itself fails the trajectory, as
 *   {@link Metric.produce} states.
 *
 * **Example** (Producing the parts of a session, with what a kit derives of them)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { EventKit, ExtraKit, Metric, MetricKit, Produce, Prompt, Toolkit, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const count = new Metric.Metric({
 *   package: "tokenize",
 *   id: "count",
 *   metadata: new Metric.Metadata({ name: "Count" }),
 *   output: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make),
 *   failure: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     reason: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * // What the metric is reported by: one count of each part the kit reads. The
 * // producer is run by the kit beside the stream that produces the parts, so the
 * // counts it derives are produced among them.
 * const counting: Metric.Producer<typeof count> = (parts) =>
 *   parts.pipe(Stream.map(() =>
 *     Metric.makeOutput<typeof count>({ version: "0.1.0", tokens: 1 }, {
 *       attach: ["01890a5d-ac96-774b-bcce-b302099a8057"]
 *     })
 *   ))
 *
 * const metrickit = MetricKit.toProducers(MetricKit.make(count), {
 *   "tokenize/count": counting
 * })
 *
 * const extrakit = ExtraKit.empty
 *
 * // What the session is produced with: the config the trajectory is read with, whose
 * // metric kit states the producer of its metric.
 * const config = Trajectory.config({
 *   stream: true,
 *   toolkit: Toolkit.empty,
 *   eventkit: EventKit.empty,
 *   metrickit,
 *   extrakit
 * })
 *
 * const produced = Produce.fromSession("01890a5d-ac96-774b-bcce-b302099a8058", config)(
 *   Stream.make(Trajectory.parts(config).prompt(Prompt.make("What is 2 + 2?")))
 * )
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(produced)))
 * parts.map((part) => part._tag) // => ["Prompt", "Metric"]
 * produced.id // => "01890a5d-ac96-774b-bcce-b302099a8058"
 * ```
 *
 * @see {@link MessageStream} for the messages it produces.
 * @see {@link fromSessions} for the streams of several sessions as one.
 * @see {@link produce} for a run as it happens.
 * @see {@link Metric.produce} for what a kit derives of a kind of trajectory.
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
): <E, R>(
  stream: MessageStream<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
> {
  const [id, config] = args.length === 1 ? [undefined, args[0]] : args;

  return produceWith(id, produced(config));
}

/**
 * Produces the parts of several sessions as one trajectory, with the metric parts a
 * kit derives of them.
 *
 * **When to use**
 *
 * Use when several sessions, each already a stream of parts as {@link fromSession}
 * takes one, are to read as one trajectory, so that the parts of every session arrive
 * in one stream and what a kit derives of the trajectory is derived of every session.
 *
 * **Details**
 *
 * - The trajectory's own terms are bound first, as every constructor of this module
 *   states them: `fromSessions(id, config)` and `fromSessions(config)` both return the
 *   function the sessions are produced from, so the id given names the trajectory
 *   produced and a call stating none names it by a new uuid ({@link Trajectory}).
 * - The record is keyed by session ({@link SessionStreams}): each entry states the
 *   messages the session produces, the session it is forked from, and the extra data
 *   of that session ({@link SessionSource}). The `main` entry is the main session, which
 *   the record states whether or not it produces a message, and every other key names a
 *   session of its own — declared before the messages of its stream arrive, however few
 *   of them it gives.
 * - The declarations are produced in the order `subTo` states: the main session first,
 *   with the extra data its entry states, and each session once the session it is forked
 *   from is declared, from that session's declaration. So a session of the record
 *   continues from where another was declared, and holds none of its messages.
 * - The parts of the sessions are read together rather than one after another, so the
 *   trajectory interleaves them: the parts of one session need not be contiguous, though
 *   each session's parts keep the order its stream gave them.
 * - A `subTo` naming a session the record does not state — or sessions naming each other
 *   — fails the trajectory with the {@link TrajectoryError} of a session no declaration
 *   of can be read before another.
 * - Every part is produced as {@link fromSession} produces one, and the producers the
 *   metric kit was provided with are run over the parts of every session as they
 *   arrive, so what a kit derives of the trajectory is derived of all its sessions.
 *   Each stream is read once, however many readings the trajectory takes, and the
 *   failure a producer reports is produced as the failure of its metric rather than
 *   failing the trajectory.
 * - The trajectory fails with what any of the streams fails with, and requires the
 *   services any of them requires.
 *
 * **Example** (Producing two sessions as one trajectory)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { EventKit, ExtraKit, MetricKit, Produce, Prompt, Trajectory, Toolkit } from "@trajs/core"
 *
 * // A kit that names no metric derives nothing of a trajectory, so the trajectory
 * // holds the parts the sessions gave and no metric part.
 * const metrickit = MetricKit.toProducers(MetricKit.make(), {})
 * const extrakit = ExtraKit.empty
 *
 * const config = Trajectory.config({
 *   stream: true,
 *   toolkit: Toolkit.empty,
 *   eventkit: EventKit.empty,
 *   metrickit,
 *   extrakit
 * })
 *
 * const part = Trajectory.parts(config)
 *
 * const trajectory = Produce.fromSessions(config)({
 *   // The main session is always one of the record's sessions, whether or not it
 *   // produces a message.
 *   main: {
 *     messages: Stream.make(part.prompt(Prompt.make("What is 2 + 2?")))
 *   },
 *   // A session is forked from the session `subTo` names, and from the main session
 *   // where it states none.
 *   asking: {
 *     messages: Stream.make(
 *       part.prompt(Prompt.make("What is 4 + 4?"), { sessionId: "asking" })
 *     )
 *   },
 *   // A session may be forked from a session of its own, which is declared before it.
 *   replying: {
 *     messages: Stream.make(
 *       part.prompt(Prompt.make("And 4 + 5?"), { sessionId: "replying" })
 *     ),
 *     subTo: "asking"
 *   }
 * })
 *
 * // Every session is declared and every prompt is produced, each in the session that
 * // gave it: the parts of a session are read apart from the one order the parts of the
 * // trajectory arrive in, and the main session's prompt states none.
 * const produced = Array.from(await Effect.runPromise(Stream.runCollect(trajectory)))
 * produced.filter((held) => held._tag === "Session").map((held) => held.type.id).sort()
 * // => ["asking", "main", "replying"]
 * ```
 *
 * @see {@link SessionStreams} for what it produces.
 * @see {@link fromSession} for one session that is already a stream.
 * @see {@link produce} for the sessions a run opens.
 * @see {@link Metric.produce} for what a kit derives of a kind of trajectory.
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
): <E, R>(
  sessions: SessionStreams<ProducedConfig<Toolkit, Events, Metrics, Extras>, E, R>,
) => Trajectory.Trajectory<
  string,
  ProducedConfig<Toolkit, Events, Metrics, Extras>,
  E | TrajectoryError,
  R
> {
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
 * A session a run produces a trajectory in.
 *
 * **When to use**
 *
 * Use to write the parts of a session while a program runs rather than to produce a
 * stream that already holds them, which is what {@link fromSession} reads.
 *
 * **Details**
 *
 * - A part is written where it is enqueued rather than when the run ends, so a
 *   trajectory is read while the program that writes it runs, and what the part was
 *   produced as is returned to the caller.
 * - `enqueuePrompt` produces what a model was given and `enqueueResponse` one part of
 *   what it returned, each with the extra data the kit declares of the part it is
 *   ({@link Extra.ExtraRecord}); `enqueueEvent` produces an event of the event kit.
 * - A prompt or response part is timed where it is produced, and a caller that knows
 *   when it happened states it as the last argument of the enqueue rather than
 *   leaving the part to be timed as it is built.
 * - Every part is produced in this session: it states the id the session is named by
 *   as its `sessionId`, and a part of the main session states none, so the sessions a
 *   run opens are read apart ({@link Trajectory.SessionPart}).
 * - `forkSession` opens a session that continues from a part of this one and hands back
 *   the {@link ProduceSession} that produces in it. The `fork` it is given names the
 *   part continued from, and defaults to the declaration of this session — the point the
 *   session starts at, so a session opened that way holds none of its parts.
 * - A session is declared before the parts it produces, so opening one fails with the
 *   {@link TrajectoryError} of a trajectory whose sessions cannot be read: an `id` a
 *   session was already opened under would be declared after the parts of that session,
 *   and a `fork` naming a part the run has not written has nothing to continue from.
 *
 * @see {@link produce} for a run in one.
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
    options?: Extra.ExtraRecord<Extras, "prompt">,
    timestamp?: DateTime.Utc,
  ) => Effect.Effect<Trajectory.PromptPart<ExtraKit.Kit<Extras>>>;
  enqueueResponse: (
    response: Response.AllPartsView<Tools>,
    options?: Extra.ExtraRecord<Extras, "response">,
    timestamp?: DateTime.Utc,
  ) => Effect.Effect<Trajectory.ResponsePart<Toolkit.Toolkit<Tools>, ExtraKit.Kit<Extras>, true>>;
  enqueueEvent: (
    event: Event.EventParts<Events>,
  ) => Effect.Effect<Trajectory.EventPart<EventKit.Kit<Events>>>;
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
 * Produces what a program does with a model as a trajectory, while it runs.
 *
 * **When to use**
 *
 * Use when a trajectory is written as the program runs rather than read from a stream
 * that already holds the parts, which is what {@link fromSession} produces.
 *
 * **Details**
 *
 * - The trajectory's own terms are bound first, as every constructor of this module
 *   states them: `produce(id, config)` and `produce(config)` both return the function
 *   the run is written by, so the id given names the trajectory produced and a call
 *   stating none names it by a new uuid ({@link Trajectory}).
 * - The program is handed the {@link ProduceSession} of the main session, which the
 *   trajectory declares before the program runs — with the extra data the config states
 *   beside it ({@link ProducingConfig}). A session of its own is opened from one with
 *   {@link ProduceSession.forkSession}, and is declared before the parts it produces;
 *   every part enqueued is produced in the session that enqueued it, in the order the
 *   program enqueued it.
 * - The producers the metric kit was provided with are run over the parts as they
 *   are produced, exactly as {@link Metric.produce} runs them, and the metric parts
 *   they derive are produced among the parts they are about. The parts are read once,
 *   so a program that drives a model is not run twice.
 * - A part is produced where it is enqueued rather than when the program ends, so a
 *   trajectory is read while the program that writes it runs. The trajectory ends
 *   where the program does, and a program that fails fails the trajectory it left,
 *   since no more of it can arrive.
 * - Opening a session fails rather than producing a trajectory no reader can reach: an
 *   `id` a session was already opened under would be declared after the parts of that
 *   session, and a `fork` naming a part the run has not written has nothing to continue
 *   from — see {@link ProduceSession.forkSession}.
 *
 * **Example** (Producing a run that answers a prompt)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { EventKit, ExtraKit, MetricKit, Produce, Prompt, Response, Toolkit, Trajectory } from "@trajs/core"
 *
 * // A kit that names no metric derives nothing of a trajectory, so what the run
 * // produces is the declaration of the main session and the parts it writes, and no
 * // metric part.
 * const metrickit = MetricKit.toProducers(MetricKit.make(), {})
 *
 * const trajectory = Produce.produce(Trajectory.config({
 *   stream: true,
 *   toolkit: Toolkit.empty,
 *   eventkit: EventKit.empty,
 *   metrickit,
 *   extrakit: ExtraKit.empty
 * }))((main) =>
 *   Effect.gen(function* () {
 *     yield* main.enqueuePrompt(Prompt.make("What is 2 + 2?"))
 *     yield* main.enqueueResponse(Response.makePart("text", { text: "4" }))
 *   })
 * )
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(trajectory)))
 * parts.map((part) => part._tag) // => ["Session", "Prompt", "Response"]
 * ```
 *
 * @see {@link ProduceSession} for what the program is handed.
 * @see {@link fromSession} for a stream that already holds the parts.
 * @see {@link Metric.produce} for what a kit derives of a kind of trajectory.
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
      /** The parts the run wrote that a session continues from, by `uuid`: what a `fork` is resolved against. */
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
        /** What the parts of the session state: the id it is named by, and none for the main session. */
        stated: string | undefined,
        /** The `uuid` of the declaration of the session, which a session opened from it continues from. */
        declaration: string,
      ): ProduceSession<Toolkit["tools"], Events["events"], Extras["extra"]> => ({
        id: stated ?? Trajectory.mainSessionId,
        enqueuePrompt: (prompt, extra = {}, timestamp) =>
          enqueue(part.prompt(prompt, { sessionId: stated, timestamp, ...extra })),
        enqueueResponse: (response, extra = {}, timestamp) =>
          enqueue(part.response(response, { sessionId: stated, timestamp, ...extra })),
        enqueueEvent: (event) => enqueue(part.event(event, { sessionId: stated })),
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
