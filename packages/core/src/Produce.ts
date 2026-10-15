/**
 * Recording what a program does with a model as a trajectory.
 *
 * {@link transform} records the parts of a session that is already a stream as a
 * trajectory, and {@link produce} records a run as it happens. Either runs the
 * producers of the metric kit over what it records, so what a kit derives of a
 * recording is recorded among the parts it is about.
 */

import { Cause, Effect, Exit, Queue, Stream } from "effect";

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
 * The parts a trajectory is recorded from: what a model was given and returned,
 * and the events a kit recorded of the session.
 *
 * **When to use**
 *
 * Use to type what {@link transform} records.
 *
 * **Details**
 *
 * A part is stated as the trajectory records it — a prompt, response or event
 * part, carrying the `uuid` it is named by and the session it was recorded in — so
 * a stream of them holds the parts themselves rather than the messages they were
 * built from. A session declaration is not among them: a part names the session it
 * belongs to, and a recording is read by the sessions its parts name whether or not
 * one of them is declared.
 *
 * @see {@link transform} for the function that records them.
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
 * Records the parts of a session as a trajectory, with the metric parts a kit
 * derives of them.
 *
 * **When to use**
 *
 * Use when what a model was given and returned is already a stream of parts — a
 * session recorded elsewhere, or parts a caller assembled — and it should read as
 * a trajectory rather than as the parts it holds: so that its sessions read as one
 * recording, the kits and the metadata it was recorded with travel with its parts,
 * and what a kit derives of it is recorded among the parts it is about.
 *
 * **Details**
 *
 * - Each part is recorded as it arrives, in the order the stream gives it, and the
 *   trajectory carries the kits and the metadata given.
 * - The producers the metric kit was provided with are run over the same parts as
 *   they arrive, exactly as {@link Metric.produce} runs them, and the metric parts
 *   they derive are recorded among the parts they are about. The stream is read
 *   once — the parts and the producers each read a branch of one broadcast — so a
 *   stream that drives a model is not run twice.
 * - The failure a producer reports of a part is recorded as the failure of its
 *   metric rather than failing the recording; a failure of the run itself fails the
 *   trajectory, as {@link Metric.produce} states.
 *
 * **Example** (Recording the parts of a session, with what a kit derives of them)
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
 * // producer is run by the kit beside the stream that records the parts, so the
 * // counts it derives are recorded among them.
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
 * const recorded = Produce.transform({
 *   toolkit: Toolkit.empty,
 *   eventkit: Event.makeKit(),
 *   metrickit,
 *   extrakit,
 *   metadata: new Trajectory.Metadata({ name: "One prompt" })
 * })(Stream.make(
 *   Trajectory.promptPart(extrakit)({ prompt: Prompt.make("What is 2 + 2?"), sessionId })
 * ))
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(recorded)))
 * parts.map((part) => part._tag) // => ["Prompt", "Metric"]
 * ```
 *
 * @see {@link PartStream} for the parts it records.
 * @see {@link produce} for recording a run as it happens.
 * @see {@link Metric.produce} for what a kit derives of a kind of recording.
 * @category constructors
 */
export const transform =
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
    metadata,
  }: {
    toolkit: Toolkit;
    eventkit: Eventkit;
    metrickit: Metric.WithProducers<Metrickit>;
    extrakit: Extrakit;
    metadata: Trajectory.Metadata;
  }) =>
  <E, R>(
    stream: PartStream<Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>, E, R>,
  ): Trajectory.Trajectory<
    Trajectory.Config<true, Toolkit, Eventkit, Metrickit, Extrakit>,
    E | TrajectoryError,
    R
  > =>
    stream.pipe(
      // The recording is read twice — as the parts of the trajectory, and by the
      // producers the metric kit runs over it — so one subscription is shared
      // between the two readings rather than the stream, which may drive a model,
      // being run twice.
      Stream.broadcastN({ n: 2, capacity: "unbounded" }),
      Effect.map(([recorded, producing]) =>
        Stream.merge(
          recorded,
          producing.pipe(
            Metric.produce(metrickit),
            Stream.map((metric) => ({ _tag: "Metric" as const, metric })),
          ),
        ),
      ),
      Stream.unwrap,
      (parts) =>
        Object.assign(parts, {
          metadata,
          stream: true as const,
          toolkit,
          eventkit,
          metrickit,
          extrakit,
        }),
    );

/**
 * A session a run records a trajectory in.
 *
 * **When to use**
 *
 * Use to write the parts of a session while a program runs — what a model was
 * given and returned, and the events a kit recorded — rather than to record a
 * stream that already holds them, which is what {@link transform} reads.
 *
 * **Details**
 *
 * - A part is written where it is enqueued rather than when the run ends, so a
 *   recording is read while the program that writes it runs, and what the part
 *   was recorded as is returned to the caller.
 * - `enqueuePrompt` records what a model was given and `enqueueResponse` one part
 *   of what it returned, each with the extra data the kit declares of the part it
 *   is — {@link Extra.ExtraRecord} — and `enqueueEvent` records an event of the
 *   event kit.
 * - Every part is recorded in this session: the `sessionId` of a part is the `id`
 *   of the session that wrote it, so the parts of the sessions a run opens are
 *   read apart.
 *
 * @see {@link Producer} for what hands one out.
 * @see {@link produce} for recording a run in one.
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
  ) => Effect.Effect<Trajectory.PromptPart<Extra.Extrakit<Extras>>>;
  enqueueResponse: (
    response: Response.AllPartsView<Tools>,
    options?: Extra.ExtraRecord<Extras, "response">,
  ) => Effect.Effect<Trajectory.ResponsePart<Toolkit.Toolkit<Tools>, Extra.Extrakit<Extras>, true>>;
  enqueueEvent: (
    event: Event.EventPartsView<Events>,
  ) => Effect.Effect<Trajectory.EventPart<Event.Eventkit<Events>>>;
}>;

/**
 * The sessions a run records a trajectory in.
 *
 * **When to use**
 *
 * Use to type what {@link produce} hands a program, or to write a program that
 * records itself as a trajectory while it runs.
 *
 * **Details**
 *
 * `createSession` declares a session and hands back the {@link ProduceSession}
 * that records in it, before any of the parts it holds. It fails with the
 * {@link TrajectoryError} of a recording whose sessions cannot be read: an `id` a
 * session has already declared would be declared after the parts of that session,
 * and a `fork` naming a part the run has not written has nothing to continue
 * from. What a session is declared with beyond `id` and `fork` is the extra data
 * the kit declares of a session part.
 *
 * @see {@link ProduceSession} for what a session records with.
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
 * Records what a program does with a model as a trajectory, while it runs.
 *
 * **When to use**
 *
 * Use when a recording is written as the program runs — a session opened, and the
 * prompts a model was given, the parts it returned and the events a kit recorded
 * enqueued as they happen — rather than read from a stream that already holds the
 * parts, which is what {@link transform} records.
 *
 * **Details**
 *
 * - The program is handed a {@link Producer}, which hands out one
 *   {@link ProduceSession} per session it runs. A session is declared when it is
 *   created, before any of the parts it records, and every part enqueued is
 *   recorded in the session that enqueued it, in the order the program enqueued
 *   it.
 * - The producers the metric kit was provided with are run over the parts as they
 *   are recorded, exactly as {@link Metric.produce} runs them, and the metric
 *   parts they derive are recorded among the parts they are about. The parts are
 *   read once — the recording and the producers each read a branch of one
 *   broadcast — so a program that drives a model is not run twice.
 * - A part is recorded where it is enqueued rather than when the program ends, so
 *   a recording is read while the program that writes it runs. The recording ends
 *   where the program does, and a program that fails fails the recording it left,
 *   since no more of it can arrive.
 * - Creating a session fails rather than recording one no reader can reach: an
 *   `id` a session has already declared would be declared after the parts of that
 *   session, and a `fork` naming a part the run has not written has nothing to
 *   continue from — see {@link Producer}.
 *
 * **Example** (Recording a run that answers a prompt)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Event, Extra, Metric, Produce, Prompt, Response, Toolkit, Trajectory } from "@trajs/core"
 *
 * // A kit that names no metric derives nothing of a recording, so what the run
 * // records is the parts it writes and no metric part.
 * const metrickit = Metric.toProducers(Metric.makeKit(), {})
 *
 * const recording = Produce.produce({
 *   toolkit: Toolkit.empty,
 *   eventkit: Event.makeKit(),
 *   metrickit,
 *   extrakit: Extra.makeKit(),
 *   metadata: new Trajectory.Metadata({ name: "One answer" })
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
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(recording)))
 * parts.map((part) => part._tag) // => ["Session", "Prompt", "Response"]
 * ```
 *
 * @see {@link Producer} for what the program is handed.
 * @see {@link transform} for recording a stream that already holds the parts.
 * @see {@link Metric.produce} for what a kit derives of a kind of recording.
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
    metadata,
  }: {
    toolkit: Toolkit;
    eventkit: Eventkit;
    metrickit: Metric.WithProducers<Metrickit>;
    extrakit: Extrakit;
    metadata: Trajectory.Metadata;
  }) =>
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
    // recording through the fork — so its failure type is the end alone.
    const recording = Effect.gen(function* () {
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
        enqueuePrompt: (prompt, extra = {}) =>
          enqueue(promptPart({ prompt, sessionId: id, extra })),
        enqueueResponse: (response, extra = {}) =>
          enqueue(responsePart({ response, sessionId: id, extra })),
        enqueueEvent: (event) => enqueue(eventPart.make({ event, sessionId: id })),
      });

      const producer: Producer<Toolkit["tools"], Eventkit["events"], Extrakit["extra"]> = {
        createSession: ({ id, fork, ...extra }) =>
          Effect.gen(function* () {
            // A session is declared before the parts it records, so a declaration of
            // an id that a session was declared under already is read after the parts
            // of that session.
            if (declared.has(id)) {
              return yield* Effect.fail(TrajectoryError.session(id, "late-declaration"));
            }

            // A `fork` names a part the recording holds by the time it is read, so a
            // part the run has not written has nothing to continue from.
            if (fork !== undefined && !written.has(fork)) {
              return yield* Effect.fail(TrajectoryError.session(id, "unrecorded-fork"));
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
          Exit.isSuccess(exit) ? Effect.asVoid(Queue.end(parts)) : Effect.void,
        ),
        Stream.fromEffectDrain,
      );

      return Stream.fromQueue(parts).pipe(Stream.drainFork(program));
    });

    return Stream.unwrap(recording).pipe(
      // The recording is read twice — as the parts of the trajectory, and by the
      // producers the metric kit runs over it — so one subscription is shared
      // between the two readings rather than the run, which may drive a model,
      // being run twice.
      Stream.broadcastN({ n: 2, capacity: "unbounded" }),
      Effect.map(([recorded, producing]) =>
        Stream.merge(
          recorded,
          producing.pipe(
            Metric.produce(metrickit),
            Stream.map((metric) => ({ _tag: "Metric" as const, metric })),
          ),
        ),
      ),
      Stream.unwrap,
      (parts) =>
        Object.assign(parts, {
          metadata,
          stream: true as const,
          toolkit,
          eventkit,
          metrickit,
          extrakit,
        }),
    );
  };
