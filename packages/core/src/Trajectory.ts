/**
 * Records the messages sent to a model and the responses it produced.
 *
 * A trajectory is a stream of parts that stays attached to the toolkit and
 * metadata it was recorded with. Prompts are stored as the messages the model
 * was given, responses as the parts the model returned, and each part carries
 * an identifier so a recording can be inspected or rebound to the tools it
 * refers to.
 */

import type * as Extension from "#/Extension.ts";
import * as Response from "#/Response.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import { DateTime, Effect, Function, Schema, Stream } from "effect";
import { Prompt, Tool, Toolkit } from "effect/ai";
import * as uuid from "uuid";
import pkg from "../package.json" with { type: "json" };

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
 * Identifier schema for trajectory parts.
 *
 * **Details**
 *
 * A UUID v7 is generated for each part, so identifiers are unique and sort by
 * creation time.
 *
 * @category schemas
 */
export const Uuid = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.withConstructorDefault(Effect.sync(() => uuid.v7())),
);

/**
 * Timestamp schema for trajectory parts.
 *
 * **Details**
 *
 * The current time is recorded for each part and encoded as an ISO 8601 string.
 *
 * @category schemas
 */
export const Timestamp = Schema.DateTimeUtcFromString.pipe(
  Schema.withConstructorDefault(DateTime.now),
);

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
 * session that inherits nothing. Facts about the agent itself, such as its name
 * or role, are recorded as an extension anchored to this part's `uuid`.
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
 * const part = Trajectory.sessionPart({ session: "agent-b", fork: "0192..." })
 * part.session // => "agent-b"
 * part._tag // => "Session"
 * ```
 *
 * @category constructors
 */
export const sessionPart = (params: Parameters<typeof SessionPart.make>[0]): SessionPart =>
  SessionPart.make(params);

/**
 * Type guard to check if a trajectory part declares a session.
 *
 * **When to use**
 *
 * Use to narrow a trajectory part to the session it declares.
 *
 * @category guards
 */
export const isSessionPart = (part: { readonly _tag: string }): part is SessionPart =>
  part._tag === "Session";

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
 * Trajectory part that carries data for an extension no definition describes.
 *
 * **When to use**
 *
 * Use to type or decode extension data whose definition is not available, such
 * as when loading a recording made with extensions that are not installed.
 *
 * @category models
 */
export const AnyExtensionPart = class AnyExtensionPart extends Schema.TaggedClass<AnyExtensionPart>()(
  "Extension",
  {
    extension: Schema.String,
    version: Schema.optional(Schema.String),
    anchor: Schema.optional(Uuid),
    timestamp: Timestamp,
    data: Schema.Json,
    ...PartMetadata.fields,
  },
) {};

/**
 * Type of a trajectory part that carries data for an extension no definition
 * describes.
 *
 * @category models
 */
export type AnyExtensionPart = Schema.Schema.Type<typeof AnyExtensionPart>;

/**
 * Type guard to check if a trajectory part carries extension data.
 *
 * **When to use**
 *
 * Use to narrow a trajectory part to the extension data it carries, whether or
 * not a definition describes it.
 *
 * @category guards
 */
export const isExtensionPart = (part: { readonly _tag: string }): part is AnyExtensionPart =>
  part._tag === "Extension";

/**
 * Constructs a new extension part whose data no definition describes.
 *
 * **When to use**
 *
 * Use when recording extension data that the current definitions do not
 * describe.
 *
 * **Example** (Recording an extension part)
 *
 * ```ts import.meta.vitest
 * import { Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.anyExtensionPart({ extension: "dev.trajs.otel", data: { spanId: "s1" } })
 * part.extension // => "dev.trajs.otel"
 * ```
 *
 * @category constructors
 */
export const anyExtensionPart = (
  params: Parameters<typeof AnyExtensionPart.make>[0],
): AnyExtensionPart => AnyExtensionPart.make(params);

/**
 * Creates a Schema for the trajectory parts that carry extension data, based on
 * the registered definitions.
 *
 * **When to use**
 *
 * Use when decoding or encoding recorded extension parts with the definitions
 * they were recorded against.
 *
 * **Details**
 *
 * Each definition contributes a part whose data its schema describes. Parts that
 * no definition matches decode to {@link AnyExtensionPart} instead of failing,
 * so loading a recording does not depend on the definitions that are installed.
 * A part that a definition describes is not a class, because nothing constructs
 * it: it is only ever decoded.
 *
 * @category constructors
 */
export const ExtensionPart = (extensions: Extension.Extensions = {}) =>
  Schema.Union([
    ...Object.values(extensions).map((definition) =>
      Schema.TaggedStruct("Extension", {
        extension: Schema.Literal(definition.id),
        version: Schema.optional(Schema.String),
        anchor: Schema.optional(Uuid),
        timestamp: Timestamp,
        data: definition.schema,
        ...PartMetadata.fields,
      }),
    ),
    AnyExtensionPart,
  ]);

/**
 * Creates a Schema for trajectory parts based on a toolkit and extension
 * definitions.
 *
 * **When to use**
 *
 * Use when decoding or encoding recorded parts with the toolkit and extensions
 * they were recorded against.
 *
 * @category constructors
 */
export const Part = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Extension.Extensions = Record<string, never>,
>(
  toolkit: Toolkit.Toolkit<Tools>,
  extensions?: Exts,
) => Schema.Union([PromptPart, SessionPart, ResponsePart(toolkit), ExtensionPart(extensions)]);

/**
 * Union type of the parts of a trajectory for a toolkit and extension
 * definitions.
 *
 * @category models
 */
export type Part<
  Tools extends Record<string, Tool.Any>,
  Exts extends Extension.Extensions = Record<string, never>,
> = Schema.Schema.Type<ReturnType<typeof Part<Tools, Exts>>>;

/**
 * Encoded representation of trajectory parts for serialization.
 *
 * @category models
 */
export type PartEncoded = Schema.Codec.Encoded<ReturnType<typeof Part<any>>>;

/**
 * Trajectory part that also accepts tools outside the provided toolkit and
 * extensions no definition describes.
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
  E = never,
  R = never,
> = Stream.Stream<Part<Tools>, E | TrajectoryError, R>;

/**
 * Stream of trajectory parts that also accepts tools outside the provided
 * toolkit.
 *
 * @category models
 */
export type AnyPartStream = PartStream<Record<string, never>>;

/**
 * Stream of trajectory parts with the toolkit and metadata of a trajectory.
 *
 * **Details**
 *
 * The `toolkit` and `metadata` fields travel with the stream, so the parts and
 * the context they were recorded in stay together.
 *
 * @category models
 */
export type Trajectory<Tools extends Record<string, Tool.Any>, E = never, R = never> = PartStream<
  Tools,
  E,
  R
> &
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
     * The extension definitions used to encode and decode extension parts.
     */
    extensions: Extension.Extensions;
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
 * Creates a trajectory from a stream of parts and a toolkit.
 *
 * **When to use**
 *
 * Use when recording a session, or when binding a stream of recorded parts to
 * the tools it refers to.
 *
 * **Details**
 *
 * The toolkit and metadata are attached to the returned stream as additional
 * fields, so the parts and the context they were recorded in stay together. A
 * stream that is defined elsewhere is bound by piping it into `make`, which
 * then takes the toolkit as its first argument. Metadata is passed as a
 * {@link Metadata} value, whose `version` defaults to {@link version} when it is
 * constructed.
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
 *   Toolkit.empty,
 *   Trajectory.Metadata.make({ name: "greeting" })
 * )
 * trajectory.metadata.name // => "greeting"
 * trajectory.metadata.version === Trajectory.version // => true
 * ```
 *
 * **Example** (Binding a stream that is already defined)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Trajectory } from "@trajs/core"
 *
 * const trajectory = Stream.make(Trajectory.promptPart(Prompt.make("Hello"))).pipe(
 *   Trajectory.make(Toolkit.empty, Trajectory.Metadata.make({ name: "greeting" }))
 * )
 * trajectory.metadata.name // => "greeting"
 * ```
 *
 * @category constructors
 */
export const make: {
  <Tools extends Record<string, Tool.Any>, E, R>(
    parts: Stream.Stream<Part<Tools>, E, R>,
    toolkit: Toolkit.Toolkit<Tools>,
    metadata?: Metadata,
    extensions?: Extension.Extensions,
  ): Trajectory<Tools, E, R>;
  <Tools extends Record<string, Tool.Any>>(
    toolkit: Toolkit.Toolkit<Tools>,
    metadata?: Metadata,
    extensions?: Extension.Extensions,
  ): <E, R>(parts: Stream.Stream<Part<Tools>, E, R>) => Trajectory<Tools, E, R>;
} = Function.dual(
  (args) => Stream.isStream(args[0]),
  <Tools extends Record<string, Tool.Any>, E, R>(
    parts: Stream.Stream<Part<Tools>, E, R>,
    toolkit: Toolkit.Toolkit<Tools>,
    metadata: Metadata = Metadata.make({}),
    extensions: Extension.Extensions = {},
  ): Trajectory<Tools, E, R> => Object.assign(parts, { toolkit, metadata, extensions }),
);
