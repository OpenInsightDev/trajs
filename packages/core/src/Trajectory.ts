/**
 * Records the messages sent to a model and the responses it produced.
 *
 * A trajectory is a stream of parts that stays attached to the toolkit, metadata
 * and extensions it was recorded with. Prompts are stored as the messages the
 * model was given, responses as the parts the model returned, and each part
 * carries an identifier so a recording can be inspected or rebound to the tools
 * and extensions it refers to.
 */

import * as Extensionkit from "#/Extensionkit.ts";
import * as Response from "#/Response.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import { Effect, Function, Schema, Stream } from "effect";
import { Prompt, Tool, Toolkit } from "effect/ai";
import pkg from "../package.json" with { type: "json" };
import { Timestamp, Uuid } from "#/internal/schema.ts";

/**
 * Version of the trajs specification this package reads and writes.
 *
 * **When to use**
 *
 * Use when recording a trajectory, or when checking the specification version a
 * recording declares.
 *
 * **Details**
 *
 * The value is the version of `@trajs/core`, read from its manifest, so the
 * specification version cannot drift from the release that writes it. It is
 * written into every trajectory as the `version` field of {@link Metadata}, so a
 * recording states the specification it conforms to instead of leaving the reader
 * to guess it from the package that produced it.
 *
 * @see {@link Metadata} for the field a recording carries it in.
 * @category constants
 */
export const version = pkg.version;

/**
 * Descriptive metadata attached to a trajectory.
 *
 * **When to use**
 *
 * Use when creating a trajectory or reading its `metadata` field.
 *
 * @category models
 */
export class Metadata extends Schema.Class<Metadata>("Metadata")({
  /**
   * Version of the trajs specification the trajectory conforms to.
   *
   * **Details**
   *
   * Defaults to {@link version}, the version of `@trajs/core`, when a trajectory
   * is constructed without one. Decoding and encoding require it, so a recording
   * that does not state its version cannot be read.
   */
  version: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed(version))),
  /**
   * Optional name of the trajectory.
   */
  name: Schema.optional(Schema.String),
  /**
   * Optional description of the trajectory.
   */
  description: Schema.optional(Schema.String),
}) {}

/**
 * Encoded representation of metadata for serialization.
 *
 * @category models
 */
export type MetadataEncoded = Schema.Codec.Encoded<typeof Metadata>;

/**
 * Fields shared by every trajectory part.
 *
 * **Details**
 *
 * Spread into each part class, so every part carries its own identifier, an
 * optional session identifier and optional extra data.
 *
 * @category models
 */
export class PartMetadata extends Schema.Class<PartMetadata>("PartMetadata")({
  /**
   * Unique identifier of the part.
   */
  uuid: Uuid,
  /**
   * Optional identifier of the session the part belongs to.
   */
  session: Schema.optional(Schema.String),
  /**
   * Optional extra data attached to the part.
   */
  extra: Schema.optional(Schema.Json),
}) {}

/**
 * Trajectory part that records the messages sent to a model.
 *
 * @category models
 */
export class PromptPart extends Schema.TaggedClass<PromptPart>()("Prompt", {
  messages: Schema.Array(Prompt.Message),
  ...PartMetadata.fields,
}) {}

/**
 * Encoded representation of prompt parts for serialization.
 *
 * @category models
 */
export type PromptPartEncoded = Schema.Codec.Encoded<typeof PromptPart>;

/**
 * Constructs a new prompt part from a prompt.
 *
 * **When to use**
 *
 * Use when recording the messages a model was given.
 *
 * **Example** (Recording a prompt)
 *
 * ```ts import.meta.vitest
 * import { Prompt } from "effect/ai"
 * import { Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.promptPart(Prompt.make("What is 2 + 2?"))
 * part._tag // => "Prompt"
 * ```
 *
 * @category constructors
 */
export const promptPart = (prompt: Prompt.Prompt) => PromptPart.make({ messages: prompt.content });

/**
 * Trajectory part that declares a session and, optionally, the part of another
 * session it continues from.
 *
 * **When to use**
 *
 * Use to mark the start of a session and, when it continues from an earlier one,
 * to record where it continues from: a fork, a resumed session, or a sub-agent
 * spawned by a parent.
 *
 * **Details**
 *
 * The part's own `session` is the session it declares. `fork` names the part of
 * another session the new session continues from, and the parent session is not
 * stored because it is that part's `session`. A part with no `fork` starts a
 * session that inherits nothing.
 *
 * @see {@link sessionPart} for constructing one.
 * @category models
 */
export class SessionPart extends Schema.TaggedClass<SessionPart>()("Session", {
  ...PartMetadata.fields,
  /**
   * Identifier of the session this part declares.
   */
  session: Schema.String,
  /**
   * Identifier of the part of another session this one continues from.
   */
  fork: Schema.optional(Uuid),
  /**
   * Time the session was declared.
   */
  timestamp: Timestamp,
}) {}

/**
 * Encoded representation of session parts for serialization.
 *
 * @category models
 */
export type SessionPartEncoded = Schema.Codec.Encoded<typeof SessionPart>;

/**
 * Constructs a session part that declares a session.
 *
 * **When to use**
 *
 * Use when recording the start of a session, and where a session continues from
 * an earlier one.
 *
 * **Example** (Declaring a forked session)
 *
 * ```ts import.meta.vitest
 * import { Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.sessionPart("agent-b", { fork: "agent-a" })
 * part.session // => "agent-b"
 * part._tag // => "Session"
 * ```
 *
 * @category constructors
 */
export const sessionPart = (session: string, { fork }: { fork?: string } = {}): SessionPart =>
  SessionPart.make({ session, fork });

/**
 * Creates a Schema for a response part based on a toolkit.
 *
 * **When to use**
 *
 * Use when recording a response that was produced with a specific toolkit.
 *
 * **Details**
 *
 * The timestamp is recorded when the part is constructed, and the response
 * accepts tools outside the provided toolkit.
 *
 * @category constructors
 */
export const ResponsePart = <T extends Toolkit.Any>(toolkit: T) =>
  class ResponsePart extends Schema.TaggedClass<ResponsePart>()("Response", {
    response: Response.PartView(toolkit),
    timestamp: Timestamp,
    ...PartMetadata.fields,
  }) {};

/**
 * Encoded representation of response parts for serialization.
 *
 * @category models
 */
export type ResponsePartEncoded = Schema.Codec.Encoded<ReturnType<typeof ResponsePart<any>>>;

/**
 * Schema for a response part that also accepts tools outside the provided
 * toolkit.
 *
 * @see {@link ResponsePart} for a Schema restricted to the provided toolkit.
 * @category constructors
 */
export const AnyResponsePart = ResponsePart(Toolkit.empty);

/**
 * Response part that also accepts tools outside the provided toolkit.
 *
 * @category models
 */
export type AnyResponsePart = Schema.Schema.Type<typeof AnyResponsePart>;

/**
 * Constructs a new response part from a part produced by a model.
 *
 * **When to use**
 *
 * Use when recording a response produced by a model.
 *
 * **Example** (Recording a response part)
 *
 * ```ts import.meta.vitest
 * import { Response, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.responsePart(Response.makePart("text", { text: "Hello" }))
 * part._tag // => "Response"
 * ```
 *
 * @category constructors
 */
export const responsePart = (response: Response.Part<any>): AnyResponsePart =>
  AnyResponsePart.make({ response });

/**
 * Trajectory part that carries the data recorded for an extension.
 *
 * **When to use**
 *
 * Use when reading or matching on the extension data of a recording.
 *
 * @see {@link ExtensionPart} for the Schema that builds one.
 * @category models
 */
export type ExtensionPart<Exts extends Extensionkit.Any> = Schema.Schema.Type<
  ReturnType<typeof ExtensionPart<Exts>>
>;

/**
 * Creates a Schema for the extension parts an extension kit describes, including
 * the extensions it does not.
 *
 * **When to use**
 *
 * Use when recording data for an extension, and when decoding a recording that
 * may carry data for extensions the kit does not hold.
 *
 * **Details**
 *
 * The data recorded for one extension is {@link Extensionkit.PartView}: the parts
 * of the kit, discriminated by the identifier the data was recorded for, and
 * {@link Extensionkit.AnyPart} for an extension the kit does not hold. What the
 * trajectory records around it — the tag the part is discriminated by, when it
 * was recorded, the parts it is attached to and the fields every part carries —
 * is declared here, because it belongs to the recording rather than to the
 * extension the data came from.
 *
 * **Example** (Recording data for an extension)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension, Extensionkit, Trajectory } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.observerw.otel",
 *   Extension.Metadata.make({}),
 *   Extension.Versions.make(Schema.Struct({
 *     version: Schema.Literal("1.0.0"),
 *     spanId: Schema.String
 *   }))
 * )
 *
 * const part = Schema.decodeUnknownSync(Trajectory.ExtensionPart(Extensionkit.make(otel)))({
 *   _tag: "Extension",
 *   extension: { extension: "dev.observerw.otel", data: { version: "1.0.0", spanId: "s1" } },
 *   timestamp: "2026-01-01T00:00:00.000Z",
 *   uuid: "0190f5b2-9c3c-7b1e-8a2d-4f6b8c0d1e2f"
 * })
 * part._tag // => "Extension"
 * part.extension.extension // => "dev.observerw.otel"
 * ```
 *
 * @see {@link Extensionkit.PartView} for the data an extension kit reads.
 * @category constructors
 */
export const ExtensionPart = <Exts extends Extensionkit.Any>(extkit: Exts) =>
  Schema.TaggedStruct("Extension", {
    extension: Extensionkit.PartView(extkit),
    timestamp: Timestamp,
    attach: Schema.OptionFromOptionalKey(Schema.NonEmptyArray(Uuid)),
    ...PartMetadata.fields,
  });

/**
 * Schema for an extension part that also accepts extensions outside the provided
 * kit.
 *
 * @see {@link ExtensionPart} for a Schema built from the extensions of a kit.
 * @category constructors
 */
export const AnyExtensionPart = ExtensionPart(Extensionkit.empty);

/**
 * Extension part that also accepts extensions outside the provided kit.
 *
 * @category models
 */
export type AnyExtensionPart = Schema.Schema.Type<typeof AnyExtensionPart>;

/**
 * Creates a Schema for trajectory parts based on a toolkit and extension kit.
 *
 * **When to use**
 *
 * Use when decoding or encoding recorded parts with the toolkit and extensions
 * they were recorded against.
 *
 * @category constructors
 */
export const Part = <Tools extends Record<string, Tool.Any>, Exts extends Extensionkit.Any>(
  toolkit: Toolkit.Toolkit<Tools>,
  extkit: Exts,
) => Schema.Union([PromptPart, SessionPart, ResponsePart(toolkit), ExtensionPart(extkit)]);

/**
 * Union type of the parts of a trajectory for a toolkit and extension kit.
 *
 * @category models
 */
export type Part<
  Tools extends Record<string, Tool.Any>,
  Exts extends Extensionkit.Any = Extensionkit.Any,
> = Schema.Schema.Type<ReturnType<typeof Part<Tools, Exts>>>;

/**
 * Encoded representation of trajectory parts for serialization.
 *
 * @category models
 */
export type PartEncoded = Schema.Codec.Encoded<
  ReturnType<typeof Part<Record<string, Tool.Any>, Extensionkit.Any>>
>;

/**
 * Trajectory part that also accepts tools outside the provided toolkit and
 * extensions outside the provided extension kit.
 *
 * @category models
 */
export type AnyPart = PromptPart | SessionPart | AnyResponsePart | AnyExtensionPart;

/**
 * Stream of the parts of a trajectory.
 *
 * @category models
 */
export type PartStream<
  Tools extends Record<string, Tool.Any>,
  Exts extends Extensionkit.Any = Extensionkit.Any,
  E = never,
  R = never,
> = Stream.Stream<Part<Tools, Exts>, E | TrajectoryError, R>;

/**
 * Stream of trajectory parts that also accepts tools outside the provided
 * toolkit.
 *
 * @category models
 */
export type AnyPartStream = PartStream<Record<string, never>>;

/**
 * Stream of trajectory parts with the toolkit, metadata and extension kit of a
 * trajectory.
 *
 * **Details**
 *
 * The `toolkit`, `metadata` and `extkit` fields travel with the stream, so the
 * parts and the context they were recorded in stay together. Each of the two kits
 * is a type parameter, so a trajectory carries the tools and extensions it was
 * recorded with rather than an unknown set of them.
 *
 * @category models
 */
export type Trajectory<
  Tools extends Record<string, Tool.Any>,
  Exts extends Extensionkit.Any = Extensionkit.Any,
  E = never,
  R = never,
> = PartStream<Tools, Exts, E, R> &
  Readonly<{
    /**
     * The toolkit used to encode and decode tool parts.
     */
    toolkit: Toolkit.Toolkit<Tools>;
    /**
     * The metadata of the trajectory.
     */
    metadata: Metadata;
    /**
     * The extensions used to encode and decode extension parts.
     */
    extkit: Exts;
  }>;

/**
 * Trajectory that also accepts tools outside the provided toolkit.
 *
 * @category models
 */
export type Any = Trajectory<Record<string, never>>;

/**
 * Encoded stream of trajectory parts for serialization.
 *
 * @category models
 */
export type TrajectoryEncoded<E = never, R = never> = Stream.Stream<
  PartEncoded,
  TrajectoryError | E,
  R
>;

/**
 * Creates a trajectory from a stream of parts and, optionally, its metadata.
 *
 * **When to use**
 *
 * Use when recording a session, or when starting from a stream of recorded parts
 * that is not yet bound to the tools and extensions it refers to.
 *
 * **Details**
 *
 * The metadata is attached to the returned stream as an additional field, so the
 * parts and the description they were recorded with stay together. It is passed
 * as a {@link Metadata} value, whose `version` defaults to {@link version} when
 * it is constructed. The parts are taken in their tolerant form, so the returned
 * trajectory carries no toolkit and holds no extension kit ({@link AnyPart}): a
 * tool call or result, and a datum recorded for an extension, stay untyped.
 *
 * Bind the recording when the parts should carry the types of the tools and
 * extensions they refer to: {@link Toolkit.toolkits} narrows tool calls and
 * results to the schemas of their tools, and {@link Extensionkit.extkits} narrows
 * extension data to the versions of its extension. Both run an effect, so they
 * are piped over the trajectory rather than given to `make`.
 *
 * **Example** (Creating a trajectory)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Trajectory } from "@trajs/core"
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(Trajectory.promptPart(Prompt.make("Hello"))),
 *   Trajectory.Metadata.make({ name: "greeting" })
 * )
 * trajectory.metadata.name // => "greeting"
 * trajectory.metadata.version === Trajectory.version // => true
 * trajectory.toolkit === Toolkit.empty // => true
 * ```
 *
 * **Example** (Binding a stream that is already defined)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Trajectory } from "@trajs/core"
 *
 * const trajectory = Stream.make(Trajectory.promptPart(Prompt.make("Hello"))).pipe(
 *   Trajectory.make(Trajectory.Metadata.make({ name: "greeting" }))
 * )
 * trajectory.metadata.name // => "greeting"
 * ```
 *
 * @see {@link Metadata} for the fields the trajectory carries.
 * @category constructors
 */
export const make: {
  <E, R>(parts: Stream.Stream<AnyPart, E, R>, metadata?: Metadata): Trajectory<{}, {}, E, R>;
  (metadata?: Metadata): <E, R>(parts: Stream.Stream<AnyPart, E, R>) => Trajectory<{}, {}, E, R>;
} = Function.dual(
  (args) => Stream.isStream(args[0]),
  <E, R>(
    parts: Stream.Stream<AnyPart, E, R>,
    metadata: Metadata = Metadata.make({}),
  ): Trajectory<{}, {}, E, R> =>
    Object.assign(parts, { toolkit: Toolkit.empty, metadata, extkit: Extensionkit.empty }),
);

/**
 * Updates the metadata of a trajectory by applying a function to it.
 *
 * **When to use**
 *
 * Use to name or describe an existing recording, or to change any other field
 * of its metadata, without touching the parts it holds.
 *
 * **Details**
 *
 * The function receives the trajectory's {@link Metadata} and returns the
 * metadata the returned trajectory carries, so a field the function does not
 * carry over is dropped rather than merged. The parts, the toolkit and the
 * extension kit are shared with the trajectory it was given, which is left
 * unchanged. Both call styles are supported, so the update can be applied
 * directly or piped.
 *
 * **Example** (Naming a recording)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Trajectory } from "@trajs/core"
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(Trajectory.promptPart(Prompt.make("Hello"))),
 *   Trajectory.Metadata.make({ name: "greeting" })
 * )
 *
 * const renamed = trajectory.pipe(
 *   Trajectory.mapMetadata((metadata) =>
 *     Trajectory.Metadata.make({ version: metadata.version, name: "hello" })
 *   )
 * )
 * renamed.metadata.name // => "hello"
 * trajectory.metadata.name // => "greeting"
 * ```
 *
 * @see {@link Metadata} for the fields an update can change.
 * @category combinators
 */
export const mapMetadata: {
  <Tools extends Record<string, Tool.Any>, Exts extends Extensionkit.Any, E, R>(
    trajectory: Trajectory<Tools, Exts, E, R>,
    f: (metadata: Metadata) => Metadata,
  ): Trajectory<Tools, Exts, E, R>;
  (
    f: (metadata: Metadata) => Metadata,
  ): <Tools extends Record<string, Tool.Any>, Exts extends Extensionkit.Any, E, R>(
    trajectory: Trajectory<Tools, Exts, E, R>,
  ) => Trajectory<Tools, Exts, E, R>;
} = Function.dual(
  2,
  <Tools extends Record<string, Tool.Any>, Exts extends Extensionkit.Any, E, R>(
    trajectory: Trajectory<Tools, Exts, E, R>,
    f: (metadata: Metadata) => Metadata,
  ): Trajectory<Tools, Exts, E, R> => {
    const { toolkit, extkit } = trajectory;

    // The fields are held by the stream value itself, so the parts are mapped
    // onto a stream that is the trajectory's own before the updated metadata is
    // attached to it.
    const parts = Stream.map(trajectory, Function.identity);

    return Object.assign(parts, { toolkit, metadata: f(trajectory.metadata), extkit });
  },
);
