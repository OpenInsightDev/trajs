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
   * Optional identifier of the trajectory.
   */
  id: Schema.optional(Schema.String),
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
  Schema.withConstructorDefault(Effect.succeed(uuid.v7())),
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
 * import { Trajectory } from "trajs"
 *
 * const part = Trajectory.promptPart(Prompt.make("What is 2 + 2?"))
 * part._tag // => "Prompt"
 * ```
 *
 * @category constructors
 */
export const promptPart = (prompt: Prompt.Prompt) => PromptPart.make({ messages: prompt.content });

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
 * import { Response, Trajectory } from "trajs"
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
 * import { Trajectory } from "trajs"
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
) => Schema.Union([PromptPart, ResponsePart(toolkit), ExtensionPart(extensions)]);

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
export type AnyPart = PromptPart | AnyResponsePart | AnyExtensionPart;

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
 * then takes the toolkit as its first argument.
 *
 * **Example** (Creating a trajectory)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Trajectory } from "trajs"
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(Trajectory.promptPart(Prompt.make("Hello"))),
 *   Toolkit.empty,
 *   { name: "greeting" }
 * )
 * trajectory.metadata.name // => "greeting"
 * ```
 *
 * **Example** (Binding a stream that is already defined)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Trajectory } from "trajs"
 *
 * const trajectory = Stream.make(Trajectory.promptPart(Prompt.make("Hello"))).pipe(
 *   Trajectory.make(Toolkit.empty, { name: "greeting" })
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
    metadata: Metadata = {},
    extensions: Extension.Extensions = {},
  ): Trajectory<Tools, E, R> => Object.assign(parts, { toolkit, metadata, extensions }),
);
