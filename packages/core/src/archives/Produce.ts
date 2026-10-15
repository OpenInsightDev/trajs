/**
 * Records what a program does with an AI model as a trajectory.
 *
 * A recording is produced while the sessions it holds are run: a session is
 * declared, the prompts it was given, the response parts it produced and the
 * events a kit's extensions record are appended to it, and what was appended is
 * the trajectory. {@link transform}
 * records a session that is already a stream, {@link merge} records several such
 * sessions as one, {@link produceExtensions} attaches what further kits derive of
 * a recording already made, and {@link produce} runs a program against a
 * {@link Producer} and returns what it recorded.
 */

import { Cause, Effect, Exit, Queue, Schema, Stream } from "effect";
import { Prompt, type Tool } from "effect/ai";

import type * as Extension from "#/Extension.ts";
import * as Extkit from "#/Extensionkit.ts";
import type * as Response from "#/Response.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The fields of a part that say where it was recorded, which the recorder states
 * rather than the stream it records: the session the part was recorded in
 * (`sessionId`), the `uuid` that names the part itself, and when it was recorded
 * (`timestamp`). A message a stream gives carries none of them — or carries them
 * for the recorder to keep, since what a kit attaches to a part names that part
 * by `uuid`.
 */
type Stamped = "sessionId" | "uuid" | "timestamp";

/**
 * A message a session's stream gives, before the session records it.
 *
 * **When to use**
 *
 * Use to type what a stream a session records gives — to write one, or to read
 * what such a stream holds.
 *
 * **Details**
 *
 * It is the part the message is recorded as, apart from the fields the session
 * records: a prompt or a response part without the `sessionId` of the session and
 * without the `uuid` the recorder gives it, and a {@link Trajectory.SystemPart}
 * of one of the kit's extensions, which names no session of its own. What a
 * message says is what it was given and returned, and what the kit's extensions
 * attached to it; the recorder names the session it was recorded in, which is the
 * {@link Trajectory.rootSession} for a stream that is a session whole.
 *
 * What a message carries of the kit's extensions is recorded as the JSON of each
 * entry, which is what the part declares — see
 * {@link Extensionkit.MessageMetadata} for the data a kit reads out of it, and
 * {@link Extensionkit.MessageMetadataInput} for what writing it asks of a kit's
 * extensions.
 *
 * @see {@link SessionStream} for a stream of them.
 * @see {@link transform} for recording one.
 * @category models
 */
export type SessionMessage<K extends Trajectory.AnyKit> =
  | Omit<Trajectory.PromptPart, Stamped>
  | Omit<Trajectory.ResponsePart<K["tool"], true>, Stamped>
  | Omit<Trajectory.SystemPart<K["ext"]>, Stamped>;

/**
 * The messages a session's stream gives, as a stream.
 *
 * **When to use**
 *
 * Use to type what {@link transform} records, or what {@link merge} records
 * several of.
 *
 * @see {@link SessionMessage} for what an element of it is.
 * @category models
 */
export type SessionStream<K extends Trajectory.AnyKit, E = never, R = never> = Stream.Stream<
  SessionMessage<K>,
  E,
  R
>;

/**
 * The variant a produced trajectory is recorded in: the increments a response
 * arrives in are recorded as they arrive, and the data a kit derives of a
 * recording is carried beside the parts it is about.
 */
const streamVariant: Trajectory.StreamVariant = { ext: true, stream: true };

/**
 * The part a message of a session is recorded as, in the session that recorded
 * it.
 *
 * A recorded part names the session that gave it, which is what keeps the
 * sessions of a merge apart: the increments of a streamed response are folded by
 * the session that streamed them, and a reader of a recording reads the parts of
 * one session as that session's own. The session is the recorder's, so a message a
 * stream gives is recorded in the session this names, whatever session the message
 * itself was made in.
 */
const partOf = <K extends Trajectory.AnyKit>(kit: K, sessionId: string) => {
  const response = Trajectory.ResponsePart(kit.tool, streamVariant.stream);
  const system = Trajectory.SystemPart(kit.ext);

  return (message: SessionMessage<K>): Trajectory.Part<K, Trajectory.StreamVariant> => {
    if (message._tag === "System") {
      // SAFETY: the event is one of the kit's extensions', which is what the codec
      // the part is made with records, so what it makes is the part of that kind
      // this trajectory holds: which member that is is only known for a kit known by
      // value, and this kit is a type parameter.
      return system.make(message) as Trajectory.Part<K, Trajectory.StreamVariant>;
    }

    if (message._tag === "Prompt") {
      return Trajectory.PromptPart.make({ ...message, sessionId });
    }

    return response.make({ ...message, sessionId });
  };
};

/** The part a producer's datum is recorded as. */
const derivedPart = <Kit extends Extkit.Any>(kit: Kit) => {
  const part = Trajectory.DerivedPart(kit);

  return (produced: Extkit.ProducedPart<Extkit.Extensions<Kit>>): Trajectory.DerivedPart<Kit> =>
    part.make({
      extension: {
        extension: produced.extension,
        data: "output" in produced ? produced.output : produced.failure,
      },
      timestamp: produced.timestamp,
      attach: produced.attach,
    });
};

/**
 * The parts of a session, with the derived parts a kit derives of them.
 *
 * A recording is read twice — as the trajectory's own parts, and by the
 * producers the kit runs over it — so one subscription is shared between the
 * two readings rather than the session's stream, which may drive a model, being
 * run twice. Neither reading waits for the other, so the extensions a producer
 * derives are recorded as it derives them and one that lags holds back nothing
 * but itself.
 */
const withDerived =
  <Extkit extends Extkit.Any>(extkit: Extkit.WithProducers<Extkit>) =>
  <Kit extends Trajectory.AnyKit, E, R>(
    parts: Stream.Stream<Trajectory.Part<Kit, Trajectory.StreamVariant>, E, R>,
  ) =>
    parts.pipe(
      Stream.broadcastN({ n: 2, capacity: "unbounded" }),
      Effect.map(([recorded, producing]) =>
        Stream.merge(
          recorded,
          producing.pipe(Extkit.produce(extkit), Stream.map(derivedPart(extkit))),
        ),
      ),
      Stream.unwrap,
    );

/**
 * Records a stream of a session's messages as a trajectory.
 *
 * **When to use**
 *
 * Use when the messages a model was given and returned — each with what the
 * kit's extensions attach to it, and with the events they record — are already a
 * stream, and the recording around them, the session's parts and the data a kit
 * derives of them, should be added rather than the stream rebuilt.
 *
 * **Details**
 *
 * Each element is recorded as the part that carries it — a prompt as a
 * {@link Trajectory.PromptPart}, a response part as a
 * {@link Trajectory.ResponsePart}, and an event one of the kit's extensions
 * recorded as a {@link Trajectory.SystemPart} — in the order the stream gives
 * them. The producers the extensions of the kit were provided with are run over
 * the same stream as it arrives, and the derived parts they derive are recorded
 * beside the parts they are about, so the recording carries what the kit makes of
 * the session. The stream is read once: the parts and the producers share a
 * subscription, so a session that drives a model is not run twice.
 *
 * The session is declared by a {@link Trajectory.SessionPart} before the parts it
 * holds, since a stream of one session does not say which session it is: a stream
 * this records is the {@link Trajectory.rootSession}, and every message it gives
 * is recorded as the part that carries it, named for that session.
 *
 * @see {@link SessionMessage} for what the stream gives.
 * @see {@link merge} for recording several sessions as one trajectory.
 * @see {@link produce} for recording a session while it is run.
 * @category constructors
 */
export const transform =
  <Toolkit extends Toolkit.Any, Extkit extends Extkit.Any>({
    toolkit,
    extkit,
    metadata,
  }: {
    toolkit: Toolkit;
    extkit: Extkit.WithProducers<Extkit>;
    metadata: Trajectory.Metadata;
  }) =>
  <E, R>(
    stream: SessionStream<{ tool: Toolkit; ext: Extkit }, E, R>,
  ): Trajectory.Trajectory<{ tool: Toolkit; ext: Extkit }, Trajectory.StreamVariant, E, R> => {
    const kit = { tool: toolkit, ext: extkit } as const;

    return stream.pipe(
      Stream.map(partOf(kit, Trajectory.rootSession)),
      Stream.prepend([Trajectory.sessionPart(Trajectory.rootSession)]),
      withDerived(extkit),
      Trajectory.make(kit, streamVariant, metadata),
    );
  };

/**
 * One session a recording merges: the id it is declared under, and the stream of
 * the messages it was given and returned.
 */
type Session<K extends Trajectory.AnyKit, E, R> = Readonly<{
  id: string;
  stream: SessionStream<K, E, R>;
}>;

/**
 * Records the streams of several sessions as one trajectory.
 *
 * **When to use**
 *
 * Use when the sessions a program ran are each already a stream of what they were
 * given and returned — as {@link transform} takes one — and they are to be
 * recorded together rather than one at a time.
 *
 * **Details**
 *
 * Every session is declared by a {@link Trajectory.SessionPart} that names it, and
 * each message it gives is recorded as the part that carries it, named for the
 * session that gave it: the id a session is declared under is the recorder's, so
 * a message a stream gives carries none. The sessions are run together, so the recording
 * interleaves them: the parts of one session are not necessarily contiguous,
 * though the parts of each session keep the order its own stream gave them.
 *
 * A session is declared as one that forked from nothing the recording holds: a
 * stream of messages is a session whole, so whatever it inherited from another
 * session is among the messages it gives rather than read from the session it
 * came from.
 *
 * The producers the extensions of the kit were provided with are run over the
 * recording as it arrives, exactly as {@link transform} runs them, so the
 * derived parts they derive are recorded beside the parts they are about. Each
 * session is read once, however many readings the recording takes.
 *
 * @see {@link transform} for recording one session that is already a stream.
 * @see {@link produce} for recording the sessions a program runs.
 * @category constructors
 */
export const merge =
  <Toolkit extends Toolkit.Any, Extkit extends Extkit.Any>({
    toolkit,
    extkit,
    metadata,
  }: {
    toolkit: Toolkit;
    extkit: Extkit.WithProducers<Extkit>;
    metadata: Trajectory.Metadata;
  }) =>
  <E, R>(
    ...sessions: Session<{ tool: Toolkit; ext: Extkit }, E, R>[]
  ): Trajectory.Trajectory<{ tool: Toolkit; ext: Extkit }, Trajectory.StreamVariant, E, R> => {
    const kit = { tool: toolkit, ext: extkit } as const;

    return Stream.mergeAll(
      sessions.map(({ id, stream }) =>
        stream.pipe(Stream.map(partOf(kit, id)), Stream.prepend([Trajectory.sessionPart(id)])),
      ),
      { concurrency: "unbounded" },
    ).pipe(withDerived(extkit), Trajectory.make(kit, streamVariant, metadata));
  };

/**
 * A kit of extensions with the producer of each of them, as one
 * {@link produceExtensions} is given, whatever its producers were built with.
 *
 * A kit is read here for the extensions it holds and the producers that run for
 * them, and nothing else: a producer is already built by the time a kit holds it,
 * so neither what one was built with nor what building it failed with is a
 * property of the kit.
 */
type AnyWithProducers = Extkit.WithProducers<Extkit.Any>;

/**
 * Attaches what further kits derive of a trajectory to the trajectory itself.
 *
 * **When to use**
 *
 * Use when a recording exists already and further extensions should be derived of
 * it — a kit written after the recording was made, or one whose data is worth
 * recording for some recordings only.
 *
 * **Details**
 *
 * The producers of the kits given are run over the recording the way the kit a
 * recording is written with is run, so what they emit is recorded as the
 * derived parts of the extensions they belong to, beside the parts they were
 * derived of. Everything the recording already holds is carried over as it was
 * recorded, and a kit that derives nothing of a recording leaves the others as
 * they are.
 *
 * The returned trajectory is read with the extensions of the recording together
 * with the ones of the kits given, later kits winning the ids they share, so the
 * data of the new extensions is described by its own schema. It carries the
 * parts a kit contributes whichever variant the recording was written in: a
 * recording whose responses are the increments they arrived in keeps them
 * streamed, and one whose responses are folded keeps them folded.
 *
 * Every reading of the recording shares one subscription of it, so a recording
 * that drives a model is run once rather than once per kit. A kit is given with
 * what the producer of each of its extensions was built into — what
 * {@link Extensionkit.toProducers} takes — and every kit is read as the same kind
 * of kit, whatever its producers were built with and whatever building them
 * failed with: a run of the returned trajectory fails and requires what the
 * recording declares, since a producer was already built by the time a kit holds
 * it.
 *
 * **Example** (Recording what a kit derives of a recording)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Extension, Extensionkit, Produce, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const count = Extension.make(
 *   "org.js.tra.count",
 *   {
 *     metadata: Extension.Metadata.make({ name: "Part count" }),
 *     output: Schema.TaggedStruct(Extension.OutputTag, {
 *       version: Schema.Literal("0.1.0"),
 *       tokens: Schema.Number
 *     }).pipe(VersionedSchema.make),
 *     failure: Schema.TaggedStruct(Extension.FailureTag, {
 *       version: Schema.Literal("0.1.0"),
 *       reason: Schema.String
 *     }).pipe(VersionedSchema.make)
 *   }
 * )
 *
 * const counting: Extension.Producer<typeof count> = (messages) =>
 *   messages.pipe(Stream.map((): Extension.ProducerOutput<typeof count> => ({
 *     output: { _tag: "Output", version: "0.1.0", tokens: 1 }
 *   })))
 *
 * const extkit = Extensionkit.toProducers(
 *   Extensionkit.make({ "org.js.tra.count": count }),
 *   { "org.js.tra.count": counting }
 * )
 *
 * const recorded = Trajectory.make(
 *   Stream.make(Trajectory.promptPart(Prompt.make("Hello"), Trajectory.rootSession)),
 *   { tool: Toolkit.empty, ext: Extensionkit.empty },
 *   { ext: true, stream: true } as const
 * )
 *
 * const counted = Produce.produceExtensions(extkit)(recorded)
 * const parts = await Effect.runPromise(Stream.runCollect(counted))
 * parts.length // => 2
 * Object.keys(counted.kit.ext.extensions) // => ["org.js.tra.count"]
 * ```
 *
 * @see {@link Extensionkit.produce} for what a kit derives of a recording.
 * @see {@link merge} for recording the sessions a program runs as one trajectory.
 * @category combinators
 */
export const produceExtensions =
  <Kits extends ReadonlyArray<AnyWithProducers>>(...extkits: Kits) =>
  <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
    trajectory: Trajectory.Trajectory<K, V, E, R>,
  ): Trajectory.Trajectory<
    Trajectory.Kit<K["tool"], Extkit.Extensionkit<Extkit.Merged<[K["ext"], ...Kits]>>>,
    Trajectory.Variant<true, V["stream"]>,
    E,
    R
  > => {
    const kit = {
      tool: trajectory.kit.tool,
      ext: Extkit.merge(trajectory.kit.ext, ...extkits),
    };

    const variant: Trajectory.Variant<true, V["stream"]> = {
      ext: true,
      stream: trajectory.variant.stream,
    };

    // The kit the producers are run by holds the extensions of the kits given
    // and none of the recording's: a producer is run for every extension the kit
    // holds, so what is run with them has to be keyed as they are.
    const extensions = Extkit.merge(...extkits).extensions;
    const producers: Record<string, Extension.Producer<Extension.Any>> = {};

    for (const extkit of extkits) {
      for (const [id, producer] of Object.entries(extkit.producers)) {
        producers[id] = producer;
      }
    }

    // SAFETY: Each kit keys the producer of an extension by the id of that
    // extension, so the producers merged by id are the producers of the
    // extensions the merged kit holds, with a later kit winning the ids they
    // share.
    const running = { extensions, producers } as Extkit.WithProducers<
      Extkit.Extensionkit<Extkit.Merged<Kits>>
    >;

    // SAFETY: What a part of the recording holds is what the kit it was recorded
    // with describes, and the merged kit holds the extensions of that kit at
    // their own ids, so every part of the recording is a part of the merged kit.
    // The kit of a recording is only known to hold extensions, so neither the
    // ids its parts are recorded under nor the data they hold are known here.
    const parts = trajectory as Trajectory.TrajectoryStream<typeof kit, typeof variant, E, R>;

    return Trajectory.make(
      parts.pipe(
        Stream.broadcastN({ n: 2, capacity: "unbounded" }),
        Effect.map(([recorded, producing]) =>
          Stream.merge(
            recorded,
            producing.pipe(Extkit.produce(running), Stream.map(derivedPart(kit.ext))),
          ),
        ),
        Stream.unwrap,
      ),
      kit,
      variant,
      trajectory.metadata,
    );
  };

/**
 * The metadata a message is recorded with, as a kit requires it: an argument
 * exactly where the extensions of the kit attach metadata to a message part, and
 * none where they attach none.
 */
type MessageMetadataArgs<Exts extends Extkit.Any> = [
  Extkit.HasMessageMetadata<Extkit.Extensions<Exts>>,
] extends [true]
  ? readonly [metadata: Extkit.MessageMetadataInput<Extkit.Extensions<Exts>>]
  : readonly [];

/**
 * A session a run records a trajectory in.
 *
 * **When to use**
 *
 * Use to write the parts of a session while a program runs — the messages it was
 * given and returned, and the events a kit's extensions record — rather than
 * record a stream that already holds them.
 *
 * **Details**
 *
 * A prompt and a response are enqueued as the message they carry, and an event of
 * one of the kit's extensions as the event it recorded; each is recorded in this
 * session, and what the kit's extensions attach to a message is given with it.
 * The metadata a message is enqueued with is typed by the kit, and the extension
 * that attaches it is what reads it back — see
 * {@link Extensionkit.MessageMetadata}. *
 * @see {@link Producer} for what hands one out.
 * @see {@link Extensionkit.SystemPart} for the event an extension records.
 * @category models
 */
export type ProduceSession<
  Tools extends Record<string, Tool.Any>,
  Exts extends Extkit.Any,
> = Readonly<{
  uuid: string;
  enqueuePrompt: (
    message: Prompt.Prompt,
    ...metadata: MessageMetadataArgs<Exts>
  ) => Effect.Effect<Trajectory.PromptPart>;
  enqueueResponse: (
    response: Response.AllPartsView<Tools>,
    ...metadata: MessageMetadataArgs<Exts>
  ) => Effect.Effect<Trajectory.ResponsePart<Toolkit.Toolkit<Tools>, true>>;
  enqueueSystem: (
    system: Extkit.SystemPart<Extkit.Extensions<Exts>>,
  ) => Effect.Effect<Trajectory.SystemPart<Exts>>;
}>;

/**
 * The sessions a run records a trajectory in.
 *
 * **When to use**
 *
 * Use to write what a program does with a model as a trajectory while it runs.
 *
 * @see {@link ProduceSession} for what one hands out.
 * @see {@link produce} for what a program is given one by.
 * @category models
 */
export type Producer<Tools extends Record<string, Tool.Any>, Exts extends Extkit.Any> = Readonly<{
  createSession: (options: {
    id: string;
    fork?: string;
  }) => Effect.Effect<ProduceSession<Tools, Exts>, TrajectoryError>;
}>;

type ProduceFn<
  Tools extends Record<string, Tool.Any>,
  Exts extends Extkit.Any,
  E = never,
  R = never,
> = (producer: Producer<Tools, Exts>) => Effect.Effect<void, E, R>;

/**
 * Records what a program does with a model as a trajectory, while it runs.
 *
 * **When to use**
 *
 * Use when a recording is written as the program runs — a session opened, and the
 * prompts a model was given, the parts it returned and the events a kit's
 * extensions record enqueued as they happen — rather than read from a stream that
 * already holds the parts, which is what {@link transform} records.
 *
 * **Details**
 *
 * The program is handed a {@link Producer}, which hands out one
 * {@link ProduceSession} per session it runs. A session is declared when it is
 * created, before any of the parts it records, and every message or event enqueued
 * is recorded as the part that carries it, in the session that enqueued it. The
 * producers the extensions of the kit were provided with are run over the parts as
 * they are recorded, exactly as {@link transform} runs them, so what a kit derives
 * is recorded beside the parts it is about.
 *
 * A part is recorded where it is enqueued rather than when the program ends, and
 * the trajectory is the parts the program has written so far, so a recording is
 * read while the program that writes it runs. The recording ends where the program
 * does, and a program that fails fails the recording it left, since no more of it
 * can arrive.
 *
 * Creating a session fails rather than recording one no reader can reach: a `fork`
 * that names a part the trajectory does not hold has nothing to continue from, and
 * an `id` a session has already declared would be declared after the parts of that
 * session, which a reader takes for a late declaration.
 *
 * The metadata a message is enqueued with is what the kit's extensions attach to
 * it — {@link ProduceSession} states what a kit asks for and
 * {@link Extensionkit.MessageMetadataInput} what it holds — and is recorded as the
 * JSON of each entry, which is what a message part carries. A value the kit asks
 * for that its own schema cannot write is a defect of the extension rather than a
 * failure of the run.
 *
 * **Example** (Recording a run that answers a prompt)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Extensionkit, Produce, Response, Trajectory } from "@trajs/core"
 *
 * const extkit = Extensionkit.toProducers(Extensionkit.empty, {})
 *
 * const recording = Produce.produce({
 *   toolkit: Toolkit.empty,
 *   extkit,
 *   metadata: Trajectory.Metadata.make({}),
 * })((producer) =>
 *   Effect.gen(function* () {
 *     const session = yield* producer.createSession({ id: Trajectory.rootSession })
 *
 *     yield* session.enqueuePrompt(Prompt.make("What is 2 + 2?"))
 *     yield* session.enqueueResponse(Response.makePart("text", { text: "4" }))
 *   })
 * )
 *
 * const parts = await Effect.runPromise(Stream.runCollect(recording))
 * parts.map((part) => part._tag) // => ["Session", "Prompt", "Response"]
 * ```
 *
 * @see {@link Producer} for what the program is handed.
 * @see {@link transform} for recording a stream that already holds the parts.
 * @see {@link produceExtensions} for deriving further data of a recording made.
 * @category constructors
 */
export const produce =
  <Toolkit extends Toolkit.Any, Extkit extends Extkit.Any>({
    toolkit,
    extkit,
    metadata,
  }: {
    toolkit: Toolkit;
    extkit: Extkit.WithProducers<Extkit>;
    metadata: Trajectory.Metadata;
  }) =>
  // The program's failure and the services it reads are its own, exactly as they
  // are of a stream {@link transform} records: they are read where the program is
  // given rather than where the kit is.
  <E = never, R = never>(
    fn: ProduceFn<Toolkit["tools"], Extkit, E, R>,
  ): Trajectory.Trajectory<
    { tool: Toolkit; ext: Extkit },
    Trajectory.StreamVariant,
    E | TrajectoryError,
    R
  > => {
    // SAFETY: the kit holds the extensions `Extensions<Extkit>` names — what the
    // producers beside them were built with is not part of what it holds — so what
    // the codecs below are made with is that record of extensions, which reduces
    // the kit the parts are read with to one whose extensions are known.
    const held = Extkit.make(extkit.extensions as Extkit.Extensions<Extkit>);
    const kit = { tool: toolkit, ext: extkit } as const;

    const systemPart = Trajectory.SystemPart(held);
    const response = Trajectory.ResponsePart(kit.tool, streamVariant.stream);
    const writeMetadata = Schema.encodeEffect(Extkit.MessageMetadata(held));

    // A message is written with an entry for each extension of the kit that
    // attaches metadata, and none for a kit that attaches none: what the kit wrote
    // is read off the message, so a part with no entry records no field. A value of
    // a schema that schema cannot write is a defect of the extension that declares it
    // rather than a failure of the run, since the kit is what asked for it.
    const metadataOf = (
      given: ReadonlyArray<Extkit.MessageMetadataInput<Extkit.Extensions<Extkit>>>,
    ): Effect.Effect<Readonly<Record<string, Schema.Json>> | undefined> =>
      writeMetadata(
        // SAFETY: what a message is written with is typed by the kit, and the
        // entries the kit asks for are the entries of the schemas it holds, so what
        // is written is the metadata the codec reads and writes.
        (given[0] ?? {}) as Extkit.MessageMetadata<Extkit.Extensions<Extkit>>,
      ).pipe(
        Effect.map((written) => (Object.keys(written).length === 0 ? undefined : written)),
        Effect.orDie,
      );

    return Trajectory.make(
      withDerived(extkit)(
        Stream.unwrap(
          Effect.gen(function* () {
            // The parts a run enqueues, in the order it enqueued them.
            const parts = yield* Queue.unbounded<
              Trajectory.Part<typeof kit, Trajectory.StreamVariant>,
              E | TrajectoryError | Cause.Done
            >();

            // The sessions declared and the parts recorded, by `uuid`: a
            // declaration names the session it declares and the part it continues
            // from, and a recording whose declaration names a part it does not
            // hold is one whose sessions cannot be read.
            const declared = new Set<string>();
            const recorded = new Set<string>();

            const enqueue = (
              part: Trajectory.Part<typeof kit, Trajectory.StreamVariant>,
            ): Effect.Effect<void> =>
              Effect.gen(function* () {
                yield* Queue.offer(parts, part);
                recorded.add(part.uuid);
              });

            const session = (
              id: string,
              uuid: string,
            ): ProduceSession<Toolkit["tools"], Extkit> => ({
              uuid,
              enqueuePrompt: (message, ...given) =>
                Effect.gen(function* () {
                  const part = Trajectory.PromptPart.make({
                    messages: message.content,
                    sessionId: id,
                    metadata: yield* metadataOf(given),
                  });

                  yield* enqueue(part);

                  return part;
                }),
              enqueueResponse: (part, ...given) =>
                Effect.gen(function* () {
                  const recordedPart = response.make({
                    response: part,
                    sessionId: id,
                    metadata: yield* metadataOf(given),
                  });

                  yield* enqueue(recordedPart);

                  return recordedPart;
                }),
              enqueueSystem: (system) =>
                Effect.gen(function* () {
                  // SAFETY: the system datum is one of the kit's extensions', which is
                  // what the codec the part is made with records, so what it makes is
                  // the part of that kind this trajectory holds: which member of the
                  // trajectory's parts that is is only known for a kit known by value,
                  // and the kit here is one a caller supplied.
                  const part = systemPart.make({ system }) as Trajectory.SystemPart<Extkit> &
                    Trajectory.Part<typeof kit, Trajectory.StreamVariant>;

                  yield* enqueue(part);

                  return part;
                }),
            });

            const program = fn({
              createSession: ({ id, fork }) =>
                Effect.gen(function* () {
                  if (declared.has(id)) {
                    return yield* Effect.fail(TrajectoryError.session(id, "late-declaration"));
                  }

                  if (fork !== undefined && !recorded.has(fork)) {
                    return yield* Effect.fail(TrajectoryError.session(id, "unrecorded-fork"));
                  }

                  declared.add(id);

                  const part = Trajectory.sessionPart(id, { fork });

                  yield* enqueue(part);

                  return session(id, part.uuid);
                }),
            });

            return Stream.fromQueue(parts).pipe(
              // The recording ends where the run does: no part arrives after the
              // program that records them has ended, and a program that fails fails
              // the recording rather than leaving a reader waiting for one.
              Stream.drainFork(
                Stream.fromEffectDrain(
                  program.pipe(
                    Effect.onExit((exit) =>
                      Exit.isSuccess(exit) ? Queue.end(parts) : Effect.void,
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      ),
      kit,
      streamVariant,
      metadata,
    );
  };
