/**
 * The parts a recording is made of, and the trajectory they arrive in.
 *
 * A trajectory is a stream of parts: the prompts a model was given, the responses
 * it returned, the session each was recorded in, the system events a run recorded
 * of itself, and the data a kit derived of them. Its parts are read and written
 * under a {@link Kit} and a {@link Variant} the caller names, through {@link Part},
 * {@link ResponsePart}, {@link DerivedPart} and {@link SystemPart}; {@link make}
 * records a stream as a trajectory, and {@link fold} and {@link toMessages}
 * downgrade one to the messages it holds.
 */

import { Effect, Function, Schema, Stream } from "effect";
import { Prompt, Toolkit } from "effect/ai";

import * as Extensionkit from "#/Extensionkit.ts";
import { collapse, initial, type State } from "#/internal/folding.ts";
import { Timestamp, Uuid } from "#/internal/schema.ts";
import type { Select } from "#/internal/select.ts";
import * as Response from "#/Response.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

import pkg from "../package.json" with { type: "json" };

/**
 * The toolkit and the extension kit a trajectory is recorded with.
 *
 * **When to use**
 *
 * Use to name the kit of a trajectory that is read without knowing the tools and
 * extensions its parts refer to.
 *
 * @see {@link Variant} for what else a trajectory is recorded with.
 * @category models
 */
export type Kit<Toolkit extends Toolkit.Any, Extkit extends Extensionkit.Any> = Readonly<{
  tool: Toolkit;
  ext: Extkit;
}>;

/**
 * A kit whose tools and extensions are not known.
 *
 * @see {@link Kit} for a kit of a known toolkit and extension kit.
 * @category models
 */
export type AnyKit = Kit<Toolkit.Any, Extensionkit.Any>;

/**
 * The two dimensions a trajectory's parts vary in: whether its responses are
 * streamed, and whether it carries what a kit contributes beside them.
 *
 * **When to use**
 *
 * Use to name the variant a trajectory is recorded with, rather than leave it
 * unnamed.
 *
 * **Details**
 *
 * - `stream` selects what a response part is: streaming, the increments a model
 *   returned it in, or folded, the part those increments complete.
 * - `ext` selects whether the parts a kit contributes are members of the
 *   trajectory: a {@link DerivedPart} and a {@link SystemPart}. What an extension
 *   attaches to a message part is a field of that part rather than a part of its
 *   own, so this flag does not select it.
 *
 * A `boolean` flag is a dimension the caller did not name, and the parts of a
 * variant whose flag is one are every part that flag could have selected.
 *
 * @see {@link NonStreamMessageVariant} for the variant a recording's messages are read in.
 * @see {@link StreamVariant} for the variant a trajectory is recorded in.
 * @category models
 */
export type Variant<
  Extension extends boolean = boolean,
  Stream extends boolean = boolean,
> = Readonly<{
  ext: Extension;
  stream: Stream;
}>;

/**
 * A variant whose stream and extension flags are not known.
 *
 * @see {@link Variant} for a variant of known flags.
 * @category models
 */
export type AnyVariant = Variant<boolean, boolean>;

/**
 * The variant a recording is read in when its messages alone are read: folded
 * responses, and none of the parts a kit contributes.
 *
 * What an extension attaches to a message part is a field of that part rather
 * than a part of its own, so it travels with the messages this variant reads
 * rather than being dropped with them.
 *
 * @see {@link StreamVariant} for the variant a trajectory is recorded in.
 * @category models
 */
export type NonStreamMessageVariant = Variant<false, false>;

/**
 * The variant a recorded trajectory is written in: responses in the increments
 * they arrived in, with the parts a kit contributes beside the messages.
 *
 * @see {@link NonStreamMessageVariant} for the variant a recording's messages are read in.
 * @category models
 */
export type StreamVariant = Variant<true, true>;

/**
 * The version of this package, which a recording states as a {@link Metadata}'s
 * `version` unless the caller names another.
 *
 * @category constants
 */
export const version = pkg.version;

/**
 * What a recording states about itself, read before any of its parts.
 *
 * **When to use**
 *
 * Use to name a recording, or to read what one states about itself.
 *
 * **Details**
 *
 * `version` defaults to the version of the package that wrote the recording.
 * `name` and `description` are the caller's to set.
 *
 * @see {@link MetadataEncoded} for the form a recording carries it in.
 * @category models
 */
export class Metadata extends Schema.Class<Metadata>("Metadata")({
  version: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed(version))),
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

/**
 * A {@link Metadata} as it is encoded.
 *
 * @category models
 */
export type MetadataEncoded = Schema.Codec.Encoded<typeof Metadata>;

/**
 * The fields a message part is recorded with beyond the ones every part carries.
 *
 * **When to use**
 *
 * Use to read what the extensions of a recording attached to a message, or to
 * record a message with it.
 *
 * **Details**
 *
 * `metadata` holds what the extensions a recording was written with attach to
 * the part, keyed by the id of the extension each datum belongs to. The field is
 * open: it holds JSON the format does not interpret, and the extension that its
 * key names is what reads it. An extension that declares the role declares the
 * shape of its own entry, so what a recording holds under an id is the data of
 * the extension that was written there.
 *
 * The field is on the parts a model was given and returned rather than on every
 * part, because it is about what was said: a session declaration and a system
 * event say that something happened rather than what was said, and carry none of
 * it.
 */
const messageMetadata = {
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
};

/**
 * The session a recording of one session is recorded in.
 *
 * **When to use**
 *
 * Use as the session of the parts a recording declares nothing else for — the
 * parts of a stream recorded as one session — such as to read a recording of one
 * session back as the session it is.
 *
 * **Details**
 *
 * A part names the session that recorded it, so no prompt and no response is
 * recorded without one. A stream of one session does not say which session it is,
 * so what records one records it in this session, and every part of the stream is
 * the session's own.
 *
 * @see {@link SessionPart} for the part that declares a session.
 * @category constants
 */
export const rootSession = "root";

/**
 * The part a prompt is recorded as, in the session it was given.
 *
 * **When to use**
 *
 * Use to read back what a model was given, or, through {@link promptPart}, to
 * record it.
 *
 * **Details**
 *
 * `messages` are the messages the model was given, and `sessionId` names the
 * session they were given in. `uuid` names the part itself, as it does for every
 * part.
 *
 * A part made without a `sessionId` is recorded in the {@link rootSession}, since a
 * message a stream gives names no session of its own: what records the stream
 * names the session it records, and a message is made under the session it names
 * only where a caller records one deliberately — see
 * {@link Produce.SessionMessage}.
 *
 * @see {@link promptPart} for the constructor that records one.
 * @category models
 */
export class PromptPart extends Schema.TaggedClass<PromptPart>()("Prompt", {
  messages: Schema.Array(Prompt.Message),
  // A message a stream gives names no session, since the session it was recorded
  // in is the recorder's: one made without it is recorded in the `rootSession`
  // unless what records it names another.
  sessionId: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed(rootSession))),
  // `uuid` names the part itself, and is what a reference to a part carries: the
  // `fork` of a session declaration and the `attach` of a derived part hold it.
  uuid: Uuid,
  ...messageMetadata,
}) {}

/**
 * A prompt part, whatever the kit and variant of the trajectory it was recorded
 * with.
 *
 * @see {@link PromptPart} for the part itself.
 * @category models
 */
export type AnyPromptPart = PromptPart;

/**
 * A {@link PromptPart} as it is encoded.
 *
 * @category models
 */
export type PromptPartEncoded = Schema.Codec.Encoded<typeof PromptPart>;

/**
 * Records the part a prompt is recorded as, in the session it was given.
 *
 * A prompt belongs to the session that was given it, so the caller names that
 * session: what records a prompt outside any session of its own records it in the
 * {@link rootSession}, which is what a part made without a `sessionId` is
 * recorded in — see {@link PromptPart}.
 *
 * @see {@link PromptPart} for the part this records.
 * @category constructors
 */
export const promptPart = (prompt: Prompt.Prompt, sessionId: string = rootSession) =>
  PromptPart.make({ messages: prompt.content, sessionId });

/**
 * The part that declares a session, naming the session with `id` and the part it
 * continues from with `fork`.
 *
 * **When to use**
 *
 * Use to declare a session while it is recorded, through {@link sessionPart}, or
 * to read where a recorded session begins.
 *
 * `id` names the session this part declares, and `uuid` names the part itself.
 * `fork` names the part the session continues from. It names that part by
 * `uuid`, so a session that continues from another session's declaration holds
 * that part's `uuid`, not the `id` it
 * declares. A session that continues from nothing the recording holds has no
 * `fork`.
 *
 * A declaration is recorded before the parts the session recorded, and its `fork`
 * names a part the recording holds by the time the declaration is read. A
 * recording that declares a session after the parts it recorded, or continues from
 * a part that is not in it, is one whose sessions cannot be read: reading them
 * fails with the {@link TrajectoryError} that names the session.
 *
 * @see {@link sessionPart} for the constructor that records one.
 * @see {@link rootSession} for the session a recording of one session declares.
 * @category models
 */
export class SessionPart extends Schema.TaggedClass<SessionPart>()("Session", {
  id: Schema.String,
  fork: Schema.optional(Uuid),
  uuid: Uuid,
}) {}

/**
 * A session part, whatever the kit and variant of the trajectory it was recorded
 * with.
 *
 * @see {@link SessionPart} for the part itself.
 * @category models
 */
export type AnySessionPart = SessionPart;

/**
 * A {@link SessionPart} as it is encoded.
 *
 * @category models
 */
export type SessionPartEncoded = Schema.Codec.Encoded<typeof SessionPart>;

/**
 * Records the part that declares a session.
 *
 * @see {@link SessionPart} for the part this records, and for what `id` and `fork` name.
 * @category constructors
 */
export const sessionPart = (id: string, { fork }: { fork?: string } = {}): SessionPart =>
  SessionPart.make({ id, fork });

/**
 * The fields every response part is recorded with, whichever kind of response it
 * is.
 *
 * A response is attributed the way the prompt it answers is: the increments of a
 * streamed response are folded by the session that streamed them, so a response
 * part is recorded in the session that produced it.
 */
const responseFields = {
  timestamp: Timestamp,
  // A message a stream gives names no session, since the session it was recorded
  // in is the recorder's: one made without it is recorded in the `rootSession`
  // unless what records it names another.
  sessionId: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed(rootSession))),
  uuid: Uuid,
  ...messageMetadata,
};

const NonStreamResponsePart = <T extends Toolkit.Any>(toolkit: T) =>
  Schema.TaggedStruct("Response", {
    response: Response.PartView(toolkit),
    ...responseFields,
  });

const StreamResponsePart = <T extends Toolkit.Any>(toolkit: T) =>
  Schema.TaggedStruct("Response", {
    response: Response.AllPartsView(toolkit),
    ...responseFields,
  });

type AllResponseParts<Toolkit extends Toolkit.Any, Stream extends boolean> = Select<
  Stream,
  ReturnType<typeof StreamResponsePart<Toolkit>>,
  ReturnType<typeof NonStreamResponsePart<Toolkit>>
>;

/**
 * Creates the codec a response part is recorded and read with.
 *
 * **When to use**
 *
 * Use to record what a model returned, or to read a response part back, under the
 * toolkit the trajectory is recorded with.
 *
 * **Details**
 *
 * `toolkit` restricts the tools the response may name to the ones it holds, and
 * `stream` selects which of the two codecs is built: the increments a response
 * arrived in, or the parts those increments complete.
 *
 * @see {@link Response.AllPartsView} for the codec a streaming response carries.
 * @see {@link Response.PartView} for the codec a folded response carries.
 * @category schemas
 */
export const ResponsePart = <Toolkit extends Toolkit.Any, Stream extends boolean>(
  toolkit: Toolkit,
  stream: Stream,
): AllResponseParts<Toolkit, Stream> =>
  // SAFETY: `AllResponseParts` selects the codec pair by `Stream`, so the branch
  // taken is the pair the return type names.
  (stream ? StreamResponsePart(toolkit) : NonStreamResponsePart(toolkit)) as AllResponseParts<
    Toolkit,
    Stream
  >;

/**
 * A response part: what a model returned, recorded in the session that produced
 * it.
 *
 * **When to use**
 *
 * Use to type a response read back from a recording, or the part a response is
 * recorded as.
 *
 * **Details**
 *
 * `sessionId` names the session the response was recorded in, and `uuid` names
 * the part itself. `response` is the response as the toolkit and the kind of
 * response name it: a streaming part carries the increments it arrived in, a
 * folded one the message parts they complete.
 *
 * A part made without a `sessionId` is recorded in the {@link rootSession}, since a
 * message a stream gives names no session of its own — see
 * {@link Produce.SessionMessage}.
 *
 * @see {@link Part} for every part a trajectory is made of, this one among them.
 * @category models
 */
export type ResponsePart<Toolkit extends Toolkit.Any, Stream extends boolean> = Schema.Schema.Type<
  AllResponseParts<Toolkit, Stream>
>;

/**
 * A response part of a trajectory whose toolkit and kind of response are not
 * known, streaming or folded.
 *
 * @see {@link ResponsePart} for a response part of a known toolkit and kind.
 * @category models
 */
export type AnyResponsePart = ResponsePart<Toolkit.Any, false> | ResponsePart<Toolkit.Any, true>;

/**
 * A response part as it is encoded: the encodings of both kinds together, since a
 * part encodes the same whatever kit and kind it was recorded with.
 *
 * @category models
 */
export type ResponsePartEncoded =
  | Schema.Codec.Encoded<AllResponseParts<Toolkit.Any, false>>
  | Schema.Codec.Encoded<AllResponseParts<Toolkit.Any, true>>;

/**
 * Creates the codec a derived part is recorded and read with.
 *
 * **When to use**
 *
 * Use to record what a kit's extension derived of a recording, or to read that
 * data back, under the extension kit the recording carries.
 *
 * @see {@link Extensionkit.DerivedPartView} for the payload the codec is over.
 * @see {@link Extensionkit.ProducedPart} for what a producer yields of a recording.
 * @category schemas
 */
export const DerivedPart = <Exts extends Extensionkit.Any>(extkit: Exts) =>
  Schema.TaggedStruct("Derived", {
    extension: Extensionkit.DerivedPartView(extkit),
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
    attach: Schema.NonEmptyArray(Uuid),
    uuid: Uuid,
  });

/**
 * A part carrying what one extension derived of the parts around it.
 *
 * **When to use**
 *
 * Use to read the data an extension derived of a recording, or to record what a
 * kit derived of one.
 *
 * **Details**
 *
 * `extension` is the extension's own part: the id of the extension and the data
 * it derived. `attach` holds the `uuid`s of the parts that data is about, and is
 * never empty: a datum a producer derives of a part is about at least that part.
 * `timestamp` is when it was derived, and `uuid` names the part itself.
 *
 * @see {@link Extensionkit} for the kits whose producers derive them.
 * @category models
 */
export type DerivedPart<Exts extends Extensionkit.Any> = Schema.Schema.Type<
  ReturnType<typeof DerivedPart<Exts>>
>;

/**
 * A derived part of a trajectory whose extension kit is not known.
 *
 * @see {@link DerivedPart} for a derived part of a known kit.
 * @category models
 */
export type AnyDerivedPart = DerivedPart<Extensionkit.Any>;

/**
 * A {@link DerivedPart} as it is encoded.
 *
 * @category models
 */
export type DerivedPartEncoded = Readonly<{
  _tag: "Derived";
  extension: Extensionkit.AnyDerivedPartEncoded;
  timestamp?: string;
  attach: ReadonlyArray<string>;
  uuid: string;
}>;

/**
 * Creates the codec a system event is recorded and read with.
 *
 * **When to use**
 *
 * Use to record a system event of one of the kit's extensions, or to read one
 * back, under the extension kit the recording carries.
 *
 * @see {@link Extensionkit.SystemPartView} for the payload the codec is over.
 * @category schemas
 */
export const SystemPart = <Exts extends Extensionkit.Any>(extkit: Exts) =>
  Schema.TaggedStruct("System", {
    system: Extensionkit.SystemPartView(extkit),
    timestamp: Timestamp,
    uuid: Uuid,
  });

/**
 * A part carrying a system event one extension recorded of a run.
 *
 * **When to use**
 *
 * Use to read what an extension recorded of a run at the point it happened, or
 * to record one.
 *
 * **Details**
 *
 * `system` is the extension's own event: the id of the extension and the data it
 * recorded. The part stands where it happened rather than being about the parts
 * around it, which is what its position in the trajectory says, and `timestamp`
 * is when the event was recorded. An event is not a message: what was said is
 * recorded as a prompt or a response part, and this says that something happened
 * of the run rather than what was said. Recording events is one of the roles an
 * extension declares, which is what an {@link Extensionkit.Extensionkit} holds.
 *
 * @see {@link Extensionkit} for the kits whose extensions record them.
 * @category models
 */
export type SystemPart<Exts extends Extensionkit.Any> = Schema.Schema.Type<
  ReturnType<typeof SystemPart<Exts>>
>;

/**
 * A system event of a trajectory whose extension kit is not known.
 *
 * @see {@link SystemPart} for a system event of a known kit.
 * @category models
 */
export type AnySystemPart = SystemPart<Extensionkit.Any>;

/**
 * A {@link SystemPart} as it is encoded.
 *
 * @category models
 */
export type SystemPartEncoded = Readonly<{
  _tag: "System";
  system: Extensionkit.AnySystemPartEncoded;
  timestamp: string;
  uuid: string;
}>;

/**
 * Creates the codec a trajectory's parts are recorded and read with.
 *
 * **When to use**
 *
 * Use to write a recording, or to read one back, as the parts it is made of.
 *
 * **Details**
 *
 * The kit restricts the tools and the extensions the parts may name, and the
 * variant selects their members: a streaming response part rather than a folded
 * one, and a part a kit contributes — a derived part and a system event —
 * exactly when the variant carries them.
 *
 * @see {@link TrajectoryStream} for the streams of the parts it reads.
 * @category schemas
 */
export const Part = <const K extends AnyKit, const V extends AnyVariant>(
  kit: K,
  variant: V,
): Schema.Codec<Part<K, V>, PartEncoded, never, never> =>
  // SAFETY: The members encode `Part<K, V>` member for member, including the
  // members a kit contributes exactly when `V["ext"]`.
  Schema.Union([
    PromptPart,
    SessionPart,
    ResponsePart(kit.tool, variant.stream),
    ...(variant.ext ? [DerivedPart(kit.ext), SystemPart(kit.ext)] : []),
  ]) as any;

/**
 * A part of a trajectory: a prompt a model was given, a session that was declared,
 * a response it returned, or a part a kit contributes beside them.
 *
 * **When to use**
 *
 * Use to type the parts of a trajectory of a known kit and variant.
 *
 * **Details**
 *
 * Which members a part may be is the variant's to say, and a flag a variant leaves
 * unnamed admits both of its branches: both kinds of response part and both kinds
 * of part a kit contributes for {@link AnyVariant}.
 *
 * @see {@link PartEncoded} for the form a part is written in.
 * @category models
 */
export type Part<K extends AnyKit, V extends AnyVariant> =
  | PromptPart
  | SessionPart
  | ResponsePart<K["tool"], V["stream"]>
  | Select<V["ext"], DerivedPart<K["ext"]> | SystemPart<K["ext"]>>;

/**
 * A part of a trajectory whose kit and variant are not known.
 *
 * @see {@link Part} for a part of a known kit and variant.
 * @category models
 */
export type AnyPart = Part<AnyKit, AnyVariant>;

/**
 * A part as it is encoded, whichever kit and variant it was recorded with.
 *
 * @category models
 */
export type PartEncoded =
  | PromptPartEncoded
  | SessionPartEncoded
  | ResponsePartEncoded
  | DerivedPartEncoded
  | SystemPartEncoded;

/**
 * The parts of a trajectory as a stream.
 *
 * **When to use**
 *
 * Use to type a stream of parts that carries no kit of its own, such as the one a
 * recording is read as before the kit it was written with is in hand.
 *
 * **Details**
 *
 * The stream fails with `E` on top of the {@link TrajectoryError} a recorded
 * trajectory fails with, and requires the services `R` names.
 *
 * @see {@link Trajectory} for a stream that names the kit and variant it was recorded with.
 * @category models
 */
export type TrajectoryStream<
  K extends AnyKit,
  V extends AnyVariant,
  E = never,
  R = never,
> = Stream.Stream<Part<K, V>, E | TrajectoryError, R>;

/**
 * The parts of a trajectory whose kit and variant are not known.
 *
 * @see {@link TrajectoryStream} for a stream of a known kit and variant.
 * @category models
 */
export type AnyStream = TrajectoryStream<AnyKit, AnyVariant, any, any>;

/**
 * A stream of parts together with the kit, the variant and the metadata its
 * recording names.
 *
 * **When to use**
 *
 * Use to carry a recording through a program, since what makes its parts
 * interpretable travels with them: the tools and extensions they may name,
 * whether their responses are streamed, and the version that wrote them.
 *
 * **Details**
 *
 * `kit` restricts the tools and extensions its parts may name, and `variant`
 * says which kinds of part it holds. The stream itself is the parts, so a
 * trajectory is read exactly as a stream of them is.
 *
 * @see {@link make} for recording a stream as one.
 * @category models
 */
export interface Trajectory<
  K extends AnyKit,
  out V extends AnyVariant,
  E = never,
  R = never,
> extends TrajectoryStream<K, V, E, R> {
  readonly kit: K;
  readonly variant: V;
  readonly metadata: Metadata;
}

/**
 * A trajectory whose kit and variant are not known.
 *
 * @see {@link Trajectory} for a trajectory of a known kit and variant.
 * @category models
 */
export type Any = Trajectory<AnyKit, AnyVariant, any, any>;

/**
 * Records a stream of parts as a trajectory of the given kit and variant.
 *
 * **When to use**
 *
 * Use to name the kit and variant a stream of parts is read with, such as the one
 * a recording was written in.
 *
 * **Details**
 *
 * The metadata defaults to one whose `version` is this package's. The function is
 * dual: given the parts first it records them, and given the kit and variant
 * first it returns a function that records them.
 *
 * @see {@link empty} for a trajectory with no parts.
 * @see {@link Trajectory} for what it records.
 * @category constructors
 */
export const make: {
  <const K extends AnyKit, const V extends AnyVariant, E, R>(
    stream: TrajectoryStream<K, V, E, R>,
    kit: K,
    variant: V,
    metadata?: Metadata,
  ): Trajectory<K, V, E, R>;
  <const K extends AnyKit, const V extends AnyVariant, E, R>(
    kit: K,
    variant: V,
    metadata?: Metadata,
  ): (stream: TrajectoryStream<K, V, E, R>) => Trajectory<K, V, E, R>;
} = Function.dual(
  (args) => Stream.isStream(args[0]),
  <K extends AnyKit, V extends AnyVariant, E, R>(
    stream: TrajectoryStream<K, V, E, R>,
    kit: K,
    variant: V,
    metadata: Metadata = Metadata.make({}),
  ): Trajectory<K, V, E, R> => Object.assign(stream, { kit, variant, metadata }),
);

/**
 * A trajectory of the given kit and variant with no parts.
 *
 * **When to use**
 *
 * Use to start a recording that further parts are appended to.
 *
 * @see {@link make} for recording the parts themselves.
 * @category constructors
 */
export const empty = <const K extends AnyKit, const V extends AnyVariant>(
  kit: K,
  variant: V,
  metadata: Metadata = Metadata.make({}),
): Trajectory<K, V> => make(Stream.empty, kit, variant, metadata);

/**
 * Folds the increments a streamed response arrived in into the parts they
 * complete.
 *
 * **When to use**
 *
 * Use to downgrade a streamed trajectory to one whose responses are the parts
 * their model returned, such as to read a recording as the conversation it is
 * or to hand it to something that takes a folded trajectory.
 *
 * **Details**
 *
 * A streamed response arrives in increments — the chunks of a text or reasoning
 * part, and the parameters streaming into a tool call — and the part they
 * complete is what the trajectory means by them. The chunks are folded into
 * that part as they arrive, the increments of a tool call's parameters are
 * dropped because the call carries them, and the parts only a streamed response
 * has are dropped with them. A chunk that no end completes is dropped too: the
 * part it would complete was not recorded, and folding does not invent one.
 *
 * The responses of a trajectory whose parts are folded already are folded
 * again, which leaves them as they are, so folding is a downgrade of the
 * trajectory's variant rather than a step of a pipeline: what differs between
 * the returned stream and this one is the variant alone.
 *
 * Parts that are not responses — the prompts, the session declarations and the
 * parts a kit contributes — are carried over as they are, so the stream this returns is
 * the one it was given, with its failures, and it is the caller who knows the
 * kit, the metadata and the extensions a trajectory of these parts is recorded
 * with.
 *
 * **Example** (Folding a streamed response into the part it completes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Toolkit } from "effect/ai"
 * import { Response, Trajectory } from "@trajs/core"
 *
 * const responsePart = Trajectory.ResponsePart(Toolkit.empty, true)
 *
 * const recorded = Stream.make(
 *   responsePart.make({ response: Response.makePart("text-start", { id: "text_1" }), sessionId: Trajectory.rootSession }),
 *   responsePart.make({ response: Response.makePart("text-delta", { id: "text_1", delta: "Hi" }), sessionId: Trajectory.rootSession }),
 *   responsePart.make({ response: Response.makePart("text-end", { id: "text_1" }), sessionId: Trajectory.rootSession })
 * )
 *
 * const folded = await Effect.runPromise(Stream.runCollect(Trajectory.fold(recorded)))
 * folded.length // => 1
 * ```
 *
 * @see {@link toMessages} — drop the parts a kit contributes as well.
 * @category combinators
 */
export const fold = <K extends AnyKit, V extends AnyVariant, E, R>(
  trajectory: TrajectoryStream<K, V, E, R>,
): TrajectoryStream<K, Variant<V["ext"], false>, E, R> =>
  // SAFETY: Every response part is replaced by the parts it folds into, which
  // are the parts of a folded response — the response member of the variant the
  // return type names — and every other part is carried over unchanged, so the
  // other member of that variant is this stream's own.
  trajectory.pipe(
    Stream.mapAccum(initial, (folding, part): readonly [State, ReadonlyArray<Part<K, V>>] => {
      if (part._tag !== "Response") {
        return [folding, [part]];
      }

      // The increments of a response belong to the session that produced it,
      // so the increments of sessions recorded interleaved fold apart.
      const [folded, parts] = collapse(folding, part.sessionId, part.response);

      return [
        folded,
        // SAFETY: A folded part is the recorded part it completes with its
        // response narrowed to what it folds into, which is the response
        // member this part already had: a variant's `stream` selects which of
        // the two a response is, and no type expresses that over a variant
        // that is still generic.
        parts.map((response) => ({ ...part, response })) as ReadonlyArray<Part<K, V>>,
      ];
    }),
  ) as TrajectoryStream<K, Variant<V["ext"], false>, E, R>;

/**
 * Drops the parts a kit contributes to a trajectory, leaving its messages.
 *
 * **When to use**
 *
 * Use to downgrade a trajectory to the one its messages make up, such as to
 * hand a recording to something that reads the messages a model was given and
 * returned rather than the data derived from them.
 *
 * **Details**
 *
 * A part a kit contributes is not a message: a {@link DerivedPart} is data a kit
 * derived of the parts around it and a {@link SystemPart} is an event a run
 * recorded of itself, and a reader of the messages has no use for either. Every
 * other part, prompts, session declarations and responses alike, is carried over
 * as it is, in the order it was recorded, so the stream this returns is the one
 * it was given apart from those parts. What an extension attached to a message
 * part stays where it was: it is a field of that part rather than a part of its
 * own — see {@link messageMetadata}. It is the caller who knows the kit the
 * messages were recorded with.
 *
 * **Example** (Dropping what a kit derived of a recording)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Extensionkit, Trajectory } from "@trajs/core"
 *
 * const kit = { tool: Toolkit.empty, ext: Extensionkit.empty }
 * const variant = { ext: false, stream: false } as const
 *
 * const recorded = Stream.make(Trajectory.promptPart(Prompt.make("Hello"), Trajectory.rootSession))
 * const messages = await Effect.runPromise(Stream.runCollect(Trajectory.toMessages(recorded)))
 * messages.length // => 1
 * ```
 *
 * @see {@link fold} — the trajectories that carry data to drop.
 * @category combinators
 */
export const toMessages = <K extends AnyKit, V extends AnyVariant, E, R>(
  trajectory: TrajectoryStream<K, V, E, R>,
): TrajectoryStream<K, Variant<false, V["stream"]>, E, R> =>
  // SAFETY: The parts that are not the ones a kit contributes are the members of
  // the variant the return type names — the ones this stream's own variant has
  // apart from the response part of a streamed response, which the return type
  // keeps.
  trajectory.pipe(
    Stream.filter((part) => part._tag !== "Derived" && part._tag !== "System"),
  ) as TrajectoryStream<K, Variant<false, V["stream"]>, E, R>;
