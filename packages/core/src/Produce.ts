/**
 * Producing what a program does with a model as a trajectory.
 *
 * {@link fromSession} produces the parts of a session that is already a stream as a
 * trajectory, {@link fromSessions} produces the streams of several sessions as one,
 * and {@link produce} produces a run as it happens. Each runs the producers of the
 * metric kit over what it produces, so what a kit derives of a trajectory is produced
 * among the parts it is about.
 */

import { Cause, DateTime, Effect, Exit, Queue, Stream } from "effect";

import * as Event from "#/Event.ts";
import * as Extra from "#/Extra.ts";
import * as Metric from "#/Metric.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Tool from "#/Tool.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";

import { TrajectoryError } from "./TrajectoryError.ts";

/**
 * The parts a trajectory is produced from: what a model was given and returned,
 * and the events a kit produced of the session.
 *
 * **When to use**
 *
 * Use to type what {@link fromSession} produces.
 *
 * **Details**
 *
 * A part is stated as the trajectory produces it — a prompt, response or event
 * part, carrying the `uuid` it is named by and the session it was produced in — so
 * a stream of them holds the parts themselves rather than the messages they were
 * built from. A session declaration is not among them: a part names the session it
 * belongs to, and a trajectory is read by the sessions its parts name whether or not
 * one of them is declared.
 *
 * @see {@link fromSession} for the function that produces them.
 * @see {@link SessionStreams} for the streams of the sessions a trajectory holds one of
 * each.
 * @category models
 */
export type PartStream<Config extends Trajectory.AnyConfig, E = never, R = never> = Stream.Stream<
  | Trajectory.PromptPart<Config["extrakit"]>
  | Trajectory.ResponsePart<Config["toolkit"], Config["extrakit"], true>
  | Trajectory.EventPart<Config["eventkit"]>,
  E,
  R
>;

/**
 * The streams the sessions of a trajectory are produced from: the parts of one
 * session under the id the session is named by.
 *
 * **When to use**
 *
 * Use to type what {@link fromSessions} produces.
 *
 * **Details**
 *
 * A stream holds the parts of one session, as {@link PartStream} reads them, and the
 * id it is keyed by is the session they were produced in, which every part states of
 * itself as `sessionId`.
 *
 * @see {@link fromSessions} for the function that produces them.
 * @category models
 */
export type SessionStreams<Config extends Trajectory.AnyConfig, E = never, R = never> = Readonly<
  Record<string, PartStream<Config, E, R>>
>;

type Kits<
  Toolkit extends Toolkit.Any,
  Eventkit extends Event.AnyKit,
  Metrickit extends Metric.AnyKit,
  Extrakit extends Extra.AnyKit,
> = {
  toolkit: Toolkit;
  eventkit: Eventkit;
  metrickit: Metric.WithProducers<Metrickit>;
  extrakit: Extrakit;
};

/**
 * Every trajectory this module makes is of parts that were already read — the parts of
 * one session that is a stream, of several such sessions, and the parts a run
 * enqueued — so what a trajectory is of the kits given, and how what a kit derives of
 * it is produced among its parts, is stated here once.
 */
const produceWith =
  <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >({
    toolkit,
    eventkit,
    metrickit,
    extrakit,
  }: Kits<Toolkit, Eventkit, Metrickit, Extrakit>) =>
  <E, R>(
    stream: Trajectory.TrajectoryStream<
      Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>,
      E,
      R
    >,
  ): Trajectory.Trajectory<
    Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>,
    E | TrajectoryError,
    R
  > =>
    stream.pipe(
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
            Metric.produce(metrickit),
            Stream.map((metric) => ({ _tag: "Metric" as const, metric })),
          ),
        ),
      ),
      Stream.unwrap,
      (parts) =>
        Object.assign(parts, {
          stream: true as const,
          toolkit,
          eventkit,
          metrickit,
          extrakit,
        }),
    );

/**
 * Produces the parts of a session as a trajectory, with the metric parts a kit
 * derives of them.
 *
 * **When to use**
 *
 * Use when what a model was given and returned is already a stream of parts — a
 * session produced elsewhere, or parts a caller assembled — and it should read as
 * a trajectory rather than as the parts it holds: so that its sessions read as one
 * trajectory, the kits it was produced with travel with its parts, and what a kit
 * derives of it is produced among the parts it is about.
 *
 * **Details**
 *
 * - Each part is produced as it arrives, in the order the stream gives it, and the
 *   trajectory carries the kits given.
 * - The producers the metric kit was provided with are run over the same parts as
 *   they arrive, exactly as {@link Metric.produce} runs them, and the metric parts
 *   they derive are produced among the parts they are about. The stream is read
 *   once — the parts and the producers each read a branch of one broadcast — so a
 *   stream that drives a model is not run twice.
 * - The failure a producer reports of a part is produced as the failure of its
 *   metric rather than failing the trajectory; a failure of the run itself fails the
 *   trajectory, as {@link Metric.produce} states.
 *
 * **Example** (Producing the parts of a session, with what a kit derives of them)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Event, Extra, Metric, Produce, Prompt, Toolkit, Trajectory, VersionedSchema } from "@trajs/core"
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
 * const metrickit = Metric.toProducers(Metric.makeKit(count), {
 *   "tokenize/count": counting
 * })
 *
 * const extrakit = Extra.makeKit()
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 *
 * const produced = Produce.fromSession({
 *   toolkit: Toolkit.empty,
 *   eventkit: Event.makeKit(),
 *   metrickit,
 *   extrakit
 * })(Stream.make(
 *   Trajectory.promptPart(extrakit)({ prompt: Prompt.make("What is 2 + 2?"), sessionId })
 * ))
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(produced)))
 * parts.map((part) => part._tag) // => ["Prompt", "Metric"]
 * ```
 *
 * @see {@link PartStream} for the parts it produces.
 * @see {@link fromSessions} for trajectory the streams of several sessions as one.
 * @see {@link produce} for trajectory a run as it happens.
 * @see {@link Metric.produce} for what a kit derives of a kind of trajectory.
 * @category constructors
 */
export const fromSession =
  <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >({
    toolkit,
    eventkit,
    metrickit,
    extrakit,
  }: Kits<Toolkit, Eventkit, Metrickit, Extrakit>) =>
  <E, R>(
    stream: PartStream<Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>, E, R>,
  ): Trajectory.Trajectory<
    Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>,
    E | TrajectoryError,
    R
  > =>
    produceWith({ toolkit, eventkit, metrickit, extrakit })(stream);

/**
 * Produces the parts of several sessions as one trajectory, with the metric parts a
 * kit derives of them.
 *
 * **When to use**
 *
 * Use when the sessions that are to read as one trajectory are each already a stream
 * of parts — as {@link fromSession} takes one — and it is the whole of what they did
 * that is worth reading: so that the parts of every session arrive in one stream,
 * what a kit derives of the trajectory is derived of every session of it.
 *
 * **Details**
 *
 * - The record given is keyed by session: the id a stream is given is the session its
 *   parts were produced in, and that session is declared among the parts before the
 *   parts of its stream arrive. Every part states the session it was produced in of
 *   itself, as {@link PartStream} reads one, so a session whose stream gives no part
 *   is still declared, and read among the sessions of the trajectory.
 * - The streams are read together rather than one after another, so the trajectory
 *   interleaves the sessions: the parts of one session are not necessarily
 *   contiguous, though the parts of each keep the order its own stream gave them.
 * - Every part is produced as {@link fromSession} produces one, and the producers the
 *   metric kit was provided with are run over the parts of every session as they
 *   arrive, so what a kit derives of the trajectory is derived of all its sessions.
 *   Each stream is read once, however many readings the trajectory takes, and the
 *   failure a producer reports of a part is produced as the failure of its metric
 *   rather than failing the trajectory.
 * - The trajectory fails with what any of the streams fails with, and requires the
 *   services any of them requires.
 *
 * **Example** (Producing two sessions as one trajectory)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Event, Extra, Metric, Produce, Prompt, Trajectory, Toolkit } from "@trajs/core"
 *
 * // A kit that names no metric derives nothing of a trajectory, so the trajectory
 * // holds the parts the sessions gave and no metric part.
 * const metrickit = Metric.toProducers(Metric.makeKit(), {})
 * const extrakit = Extra.makeKit()
 *
 * const trajectory = Produce.fromSessions({
 *   toolkit: Toolkit.empty,
 *   eventkit: Event.makeKit(),
 *   metrickit,
 *   extrakit
 * })({
 *   asking: Stream.make(
 *     Trajectory.promptPart(extrakit)({
 *       prompt: Prompt.make("What is 2 + 2?"),
 *       sessionId: "asking"
 *     })
 *   ),
 *   answering: Stream.make(
 *     Trajectory.promptPart(extrakit)({
 *       prompt: Prompt.make("What is 4 + 4?"),
 *       sessionId: "answering"
 *     })
 *   )
 * })
 *
 * // Both sessions are declared and both prompts are produced, each in the session
 * // that gave it: the parts of a session are read apart from the one order the
 * // parts of the trajectory arrive in.
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(trajectory)))
 * parts.map((part) => (part._tag === "Session" ? part.id : part.sessionId)).sort()
 * // => ["answering", "answering", "asking", "asking"]
 * ```
 *
 * @see {@link SessionStreams} for what it produces.
 * @see {@link fromSession} for trajectory one session that is already a stream.
 * @see {@link produce} for trajectory the sessions a run opens.
 * @see {@link Metric.produce} for what a kit derives of a kind of trajectory.
 * @category constructors
 */
export const fromSessions =
  <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >({
    toolkit,
    eventkit,
    metrickit,
    extrakit,
  }: Kits<Toolkit, Eventkit, Metrickit, Extrakit>) =>
  <E, R>(
    sessions: SessionStreams<Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>, E, R>,
  ): Trajectory.Trajectory<
    Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>,
    E | TrajectoryError,
    R
  > => {
    const sessionPart = Trajectory.sessionPart(extrakit);

    return produceWith({ toolkit, eventkit, metrickit, extrakit })(
      Stream.mergeAll(
        Object.entries(sessions).map(([id, parts]) =>
          parts.pipe(
            // A stream of a session names it rather than declaring it, so the session
            // is declared here: a session is read before the parts of it arrive.
            Stream.prepend([sessionPart({ id })]),
          ),
        ),
        { concurrency: "unbounded" },
      ),
    );
  };

/**
 * A session a run produces a trajectory in.
 *
 * **When to use**
 *
 * Use to write the parts of a session while a program runs — what a model was
 * given and returned, and the events a kit produced — rather than to produce a
 * stream that already holds them, which is what {@link fromSession} reads.
 *
 * **Details**
 *
 * - A part is written where it is enqueued rather than when the run ends, so a
 *   trajectory is read while the program that writes it runs, and what the part
 *   was produced as is returned to the caller.
 * - `enqueuePrompt` produces what a model was given and `enqueueResponse` one part
 *   of what it returned, each with the extra data the kit declares of the part it
 *   is — {@link Extra.ExtraRecord} — and `enqueueEvent` produces an event of the
 *   event kit.
 * - A prompt or response part is timed where it is produced, and a caller that
 *   knows the moment it happened states it as the last argument of the enqueue
 *   rather than leaving the part to be timed as it is built — which is how a part
 *   read from a record that times it keeps the moment that record gives.
 * - Every part is produced in this session: the `sessionId` of a part is the `id`
 *   of the session that wrote it, so the parts of the sessions a run opens are
 *   read apart.
 *
 * @see {@link Producer} for what hands one out.
 * @see {@link produce} for trajectory a run in one.
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
  ) => Effect.Effect<Trajectory.PromptPart<Extra.Extrakit<Extras>>>;
  enqueueResponse: (
    response: Response.AllPartsView<Tools>,
    options?: Extra.ExtraRecord<Extras, "response">,
    timestamp?: DateTime.Utc,
  ) => Effect.Effect<Trajectory.ResponsePart<Toolkit.Toolkit<Tools>, Extra.Extrakit<Extras>, true>>;
  enqueueEvent: (
    event: Event.EventPartsView<Events>,
  ) => Effect.Effect<Trajectory.EventPart<Event.Eventkit<Events>>>;
}>;

/**
 * The sessions a run produces a trajectory in.
 *
 * **When to use**
 *
 * Use to type what {@link produce} hands a program, or to write a program that
 * produces itself as a trajectory while it runs.
 *
 * **Details**
 *
 * `createSession` declares a session and hands back the {@link ProduceSession}
 * that produces in it, before any of the parts it holds. It fails with the
 * {@link TrajectoryError} of a trajectory whose sessions cannot be read: an `id` a
 * session has already declared would be declared after the parts of that session,
 * and a `fork` naming a part the run has not written has nothing to continue
 * from. What a session is declared with beyond `id` and `fork` is the extra data
 * the kit declares of a session part.
 *
 * @see {@link ProduceSession} for what a session produces with.
 * @see {@link produce} for what a program is handed one by.
 * @category models
 */
export type Producer<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
> = Readonly<{
  createSession: (
    options: { id: string; fork?: string } & Extra.ExtraRecord<Extras, "session">,
  ) => Effect.Effect<ProduceSession<Tools, Events, Extras>, TrajectoryError>;
}>;

type ProduceFn<
  Tools extends Record<string, Tool.Any>,
  Events extends Record<string, Event.Any>,
  Extras extends Record<string, Extra.Any>,
  E = never,
  R = never,
> = (producer: Producer<Tools, Events, Extras>) => Effect.Effect<void, E, R>;

/**
 * Produces what a program does with a model as a trajectory, while it runs.
 *
 * **When to use**
 *
 * Use when a trajectory is written as the program runs — a session opened, and the
 * prompts a model was given, the parts it returned and the events a kit produced
 * enqueued as they happen — rather than read from a stream that already holds the
 * parts, which is what {@link fromSession} produces.
 *
 * **Details**
 *
 * - The program is handed a {@link Producer}, which hands out one
 *   {@link ProduceSession} per session it runs. A session is declared when it is
 *   created, before any of the parts it produces, and every part enqueued is
 *   produced in the session that enqueued it, in the order the program enqueued
 *   it.
 * - The producers the metric kit was provided with are run over the parts as they
 *   are produced, exactly as {@link Metric.produce} runs them, and the metric
 *   parts they derive are produced among the parts they are about. The parts are
 *   read once — the trajectory and the producers each read a branch of one
 *   broadcast — so a program that drives a model is not run twice.
 * - A part is produced where it is enqueued rather than when the program ends, so
 *   a trajectory is read while the program that writes it runs. The trajectory ends
 *   where the program does, and a program that fails fails the trajectory it left,
 *   since no more of it can arrive.
 * - Creating a session fails rather than trajectory one no reader can reach: an
 *   `id` a session has already declared would be declared after the parts of that
 *   session, and a `fork` naming a part the run has not written has nothing to
 *   continue from — see {@link Producer}.
 *
 * **Example** (Producing a run that answers a prompt)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Event, Extra, Metric, Produce, Prompt, Response, Toolkit, Trajectory } from "@trajs/core"
 *
 * // A kit that names no metric derives nothing of a trajectory, so what the run
 * // produces is the parts it writes and no metric part.
 * const metrickit = Metric.toProducers(Metric.makeKit(), {})
 *
 * const trajectory = Produce.produce({
 *   toolkit: Toolkit.empty,
 *   eventkit: Event.makeKit(),
 *   metrickit,
 *   extrakit: Extra.makeKit()
 * })((producer) =>
 *   Effect.gen(function* () {
 *     const session = yield* producer.createSession({
 *       id: "01890a5d-ac96-774b-bcce-b302099a8057"
 *     })
 *
 *     yield* session.enqueuePrompt(Prompt.make("What is 2 + 2?"))
 *     yield* session.enqueueResponse(Response.makePart("text", { text: "4" }))
 *   })
 * )
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(trajectory)))
 * parts.map((part) => part._tag) // => ["Session", "Prompt", "Response"]
 * ```
 *
 * @see {@link Producer} for what the program is handed.
 * @see {@link fromSession} for trajectory a stream that already holds the parts.
 * @see {@link Metric.produce} for what a kit derives of a kind of trajectory.
 * @category constructors
 */
export const produce =
  <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >({
    toolkit,
    eventkit,
    metrickit,
    extrakit,
  }: Kits<Toolkit, Eventkit, Metrickit, Extrakit>) =>
  <E, R>(
    fn: ProduceFn<Toolkit["tools"], Eventkit["events"], Extrakit["extra"], E, R>,
  ): Trajectory.Trajectory<
    Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>,
    E | TrajectoryError,
    R
  > => {
    type Config = Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>;

    const promptPart = Trajectory.promptPart(extrakit);
    const sessionPart = Trajectory.sessionPart(extrakit);
    const responsePart = Trajectory.responsePart({ toolkit, extrakit, stream: true });
    const eventPart = Trajectory.EventPart(eventkit);

    // The queue only ever ends rather than fails — a run that fails fails the
    // trajectory through the fork — so its failure type is the end alone.
    const trajectory = Effect.gen(function* () {
      const parts = yield* Queue.unbounded<Trajectory.Part<Config>, Cause.Done>();

      const declared = new Set<string>();
      const written = new Set<string>();

      const enqueue = <P extends Trajectory.Part<Config> & { readonly uuid: string }>(
        part: P,
      ): Effect.Effect<P> =>
        Effect.gen(function* () {
          yield* Queue.offer(parts, part);
          written.add(part.uuid);

          return part;
        });

      const session = (
        id: string,
      ): ProduceSession<Toolkit["tools"], Eventkit["events"], Extrakit["extra"]> => ({
        id,
        enqueuePrompt: (prompt, extra = {}, timestamp) =>
          enqueue(promptPart({ prompt, sessionId: id, extra, timestamp })),
        enqueueResponse: (response, extra = {}, timestamp) =>
          enqueue(responsePart({ response, sessionId: id, extra, timestamp })),
        enqueueEvent: (event) => enqueue(eventPart.make({ event, sessionId: id })),
      });

      const producer: Producer<Toolkit["tools"], Eventkit["events"], Extrakit["extra"]> = {
        createSession: ({ id, fork, ...extra }) =>
          Effect.gen(function* () {
            // A session is declared before the parts it produces, so a declaration of
            // an id that a session was declared under already is read after the parts
            // of that session.
            if (declared.has(id)) {
              return yield* Effect.fail(TrajectoryError.session(id, "late-declaration"));
            }

            // A `fork` names a part the trajectory holds by the time it is read, so a
            // part the run has not written has nothing to continue from.
            if (fork !== undefined && !written.has(fork)) {
              return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
            }

            declared.add(id);

            // What a session is declared with beyond `id` and `fork` is the extra
            // data the kit declares of a session part: the two name the session
            // rather than hold data of it, and what remains is exactly that record.
            // SAFETY: destructuring retains the kit's tags beside the record's index
            // signature, so the rest is the extra data of a session part; TypeScript
            // leaves the rest of an intersection unevaluated and does not see it.
            const extraData = extra as Extra.ExtraRecord<Extrakit["extra"], "session">;

            yield* enqueue(sessionPart({ id, fork, extra: extraData }));

            return session(id);
          }),
      };

      const program = fn(producer).pipe(
        Effect.onExit((exit) =>
          Exit.isSuccess(exit) ? Queue.end(parts).pipe(Effect.asVoid) : Effect.void,
        ),
        Stream.fromEffectDrain,
      );

      return Stream.fromQueue(parts).pipe(Stream.drainFork(program));
    });

    return produceWith({ toolkit, eventkit, metrickit, extrakit })(trajectory.pipe(Stream.unwrap));
  };
