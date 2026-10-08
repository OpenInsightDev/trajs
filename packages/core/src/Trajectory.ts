import * as Response from "#/Response.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import { DateTime, Effect, Schema, Stream } from "effect";
import { Prompt, Tool, Toolkit } from "effect/ai";
import * as uuid from "uuid";

/**
 * Descriptive metadata attached to a trajectory.
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
 */
export type MetadataEncoded = Schema.Codec.Encoded<typeof Metadata>;

export const Uuid = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.withConstructorDefault(Effect.succeed(uuid.v7())),
);

export const Timestamp = Schema.DateTimeUtcFromString.pipe(
  Schema.withConstructorDefault(DateTime.now),
);

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
 */
export class PromptPart extends Schema.TaggedClass<PromptPart>()("Prompt", {
  messages: Schema.Array(Prompt.Message),
  ...PartMetadata.fields,
}) {}

/**
 * Encoded representation of prompt parts for serialization.
 */
export type PromptPartEncoded = Schema.Codec.Encoded<typeof PromptPart>;

/**
 * Constructs a new prompt part from a prompt.
 *
 * **Example** (Recording a prompt)
 *
 * ```ts import.meta.vitest
 * import { Prompt, Trajectory } from "@open-insight/trajectory"
 *
 * const part = Trajectory.promptPart(Prompt.make("What is 2 + 2?"))
 * part._tag // => "Prompt"
 * ```
 */
export const promptPart = (prompt: Prompt.Prompt) => PromptPart.make({ messages: prompt.content });

/**
 * Creates a Schema for a response part based on a toolkit.
 *
 * **Details**
 *
 * The timestamp is recorded when the part is constructed, and the response
 * accepts tools outside the provided toolkit.
 */
export const ResponsePart = <T extends Toolkit.Any>(toolkit: T) =>
  class ResponsePart extends Schema.TaggedClass<ResponsePart>()("Response", {
    response: Response.PartView(toolkit),
    timestamp: Timestamp,
    ...PartMetadata.fields,
  }) {};

/**
 * Encoded representation of response parts for serialization.
 */
export type ResponsePartEncoded = Schema.Codec.Encoded<ReturnType<typeof ResponsePart<any>>>;

/**
 * Schema for a response part that also accepts tools outside the provided
 * toolkit.
 *
 * @see {@link ResponsePart} for a Schema restricted to the provided toolkit.
 */
export const AnyResponsePart = ResponsePart(Toolkit.empty);

/**
 * Response part that also accepts tools outside the provided toolkit.
 */
export type AnyResponsePart = Schema.Schema.Type<typeof AnyResponsePart>;

/**
 * Constructs a new response part from a part produced by a model.
 *
 * **Example** (Recording a response part)
 *
 * ```ts import.meta.vitest
 * import { Response, Trajectory } from "@open-insight/trajectory"
 *
 * const part = Trajectory.responsePart(Response.makePart("text", { text: "Hello" }))
 * part._tag // => "Response"
 * ```
 */
export const responsePart = (response: Response.Part<any>): AnyResponsePart =>
  AnyResponsePart.make({ response });

/**
 * Creates a Schema for trajectory parts based on a toolkit.
 */
export const Part = <Tools extends Record<string, Tool.Any>>(toolkit: Toolkit.Toolkit<Tools>) =>
  Schema.Union([PromptPart, ResponsePart(toolkit)]);

/**
 * Union type of the parts of a trajectory for a toolkit.
 */
export type Part<Tools extends Record<string, Tool.Any>> = Schema.Schema.Type<
  ReturnType<typeof Part<Tools>>
>;

/**
 * Encoded representation of trajectory parts for serialization.
 */
export type PartEncoded = Schema.Codec.Encoded<ReturnType<typeof Part<any>>>;

/**
 * Trajectory part that also accepts tools outside the provided toolkit.
 */
export type AnyPart = PromptPart | AnyResponsePart;

/**
 * Stream of the parts of a trajectory.
 */
export type PartStream<
  Tools extends Record<string, Tool.Any>,
  E = never,
  R = never,
> = Stream.Stream<Part<Tools>, E | TrajectoryError, R>;

/**
 * Stream of trajectory parts that also accepts tools outside the provided
 * toolkit.
 */
export type AnyPartStream = PartStream<Record<string, never>>;

/**
 * Stream of trajectory parts with the toolkit and metadata of a trajectory.
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
  }>;

/**
 * Trajectory that also accepts tools outside the provided toolkit.
 */
export type Any = Trajectory<Record<string, never>>;

/**
 * Encoded stream of trajectory parts for serialization.
 */
export type TrajectoryEncoded<E = never, R = never> = Stream.Stream<
  PartEncoded,
  TrajectoryError | E,
  R
>;

/**
 * Creates a trajectory from a stream of parts and a toolkit.
 *
 * **Details**
 *
 * The metadata is decoded from its encoded form, and failures of the source
 * stream are mapped to the `StreamingError` reason of {@link TrajectoryError}.
 *
 * **Example** (Creating a trajectory)
 *
 * ```ts import.meta.vitest
 * import { Prompt, Trajectory } from "@open-insight/trajectory"
 * import { Stream } from "effect"
 * import { Toolkit } from "effect/ai"
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(Trajectory.promptPart(Prompt.make("Hello"))),
 *   Toolkit.empty,
 *   { name: "greeting" }
 * )
 * trajectory.metadata.name // => "greeting"
 * ```
 */
export const make = <Tools extends Record<string, Tool.Any>, E, R>(
  parts: Stream.Stream<Part<Tools>, E, R>,
  toolkit: Toolkit.Toolkit<Tools>,
  metadata: Metadata = {},
): Trajectory<Tools, E, R> => Object.assign(parts, { toolkit, metadata });
