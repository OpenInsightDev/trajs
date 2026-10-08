/**
 * Response parts that tolerate tools the toolkit does not know about.
 *
 * `effect/ai/Response` types tool call and tool result parts by the tool names of
 * the toolkit they were built from, so decoding a recorded response that mentions
 * any other tool fails. Each `*View` schema unions the upstream schema with the
 * two unconstrained parts below, `AnyToolCallPart` / `AnyToolResultPart`, so those
 * tools decode instead of being rejected while tools that are in the toolkit keep
 * their exact names, parameters and results. A part claiming a known tool name
 * whose payload no longer matches that tool's schema also falls back to the
 * unconstrained part, because loading recorded history should not depend on the
 * current tool schemas.
 */

import { Effect, identity, Predicate, Schema, SchemaTransformation } from "effect";
export * from "effect/ai/Response";
import type { Tool, Toolkit } from "effect/ai";
import {
  AllParts,
  Part,
  ProviderMetadata,
  StreamPart,
  toolCallPart,
  toolResultPart,
} from "effect/ai/Response";
import type {
  AllPartsEncoded,
  ConstructorParams,
  PartEncoded,
  StreamPartEncoded,
  ToolCallPart,
  ToolCallPartEncoded,
  ToolCallParts,
  ToolParametersMode,
  ToolResultPart,
  ToolResultPartEncoded,
  ToolResultParts,
} from "effect/ai/Response";

// HACK: `effect/ai/Response` does not export its `PartTypeId`, so it is copied
// verbatim; if it drifts, the parts decoded below stop satisfying the
// `ToolCallPart` / `ToolResultPart` types they are declared as, which
// `tests/response.test.ts` pins.
const PartTypeId = "~effect/ai/Response/Part" as const;

const AnyToolCallPartTypeId = "~effect/ai/Content/AnyToolCallPart" as const;

const AnyToolResultPartTypeId = "~effect/ai/Content/AnyToolResultPart" as const;

/**
 * Union type for all response parts that also accepts tools outside the
 * provided toolkit.
 *
 * @see {@link AllParts} for toolkit-specific response parts.
 * @category models
 */
export type AllPartsView<Tools extends Record<string, Tool.Any>> =
  | AllParts<Tools>
  | AnyToolCallPart
  | AnyToolResultPart;

/**
 * Creates a Schema for all response parts, including tools outside the provided
 * toolkit.
 *
 * @see {@link AllParts} for a Schema restricted to the provided toolkit.
 * @category schemas
 */
export const AllPartsView = <T extends Toolkit.Any | Toolkit.WithHandler<any>>(
  toolkit: T,
): Schema.Codec<
  AllPartsView<T extends Toolkit.Any ? Toolkit.Tools<T> : Toolkit.WithHandlerTools<T>>,
  AllPartsEncoded,
  Tool.ResultDecodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>,
  Tool.ResultEncodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>
> => withAnyToolParts(AllParts(toolkit));

/**
 * Union type for non-streaming response parts that also accepts tools outside
 * the provided toolkit.
 *
 * @see {@link Part} for toolkit-specific non-streaming response parts.
 * @category models
 */
export type PartView<
  Tools extends Record<string, Tool.Any>,
  EncodedToolParameters extends ToolParametersMode = "decoded",
> = Part<Tools, EncodedToolParameters> | AnyToolCallPart | AnyToolResultPart;

/**
 * Creates a Schema for non-streaming response parts, including tools outside the
 * provided toolkit.
 *
 * @see {@link Part} for a Schema restricted to the provided toolkit.
 * @category schemas
 */
export const PartView = <T extends Toolkit.Any | Toolkit.WithHandler<any>>(
  toolkit: T,
): Schema.Codec<
  PartView<T extends Toolkit.Any ? Toolkit.Tools<T> : Toolkit.WithHandlerTools<T>>,
  PartEncoded,
  Tool.ResultDecodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>,
  Tool.ResultEncodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>
> => withAnyToolParts(Part(toolkit));

/**
 * Union type for streaming response parts that also accepts tools outside the
 * provided toolkit.
 *
 * @see {@link StreamPart} for toolkit-specific streaming response parts.
 * @category models
 */
export type StreamPartView<
  Tools extends Record<string, Tool.Any>,
  EncodedToolParameters extends ToolParametersMode = "decoded",
> = StreamPart<Tools, EncodedToolParameters> | AnyToolCallPart | AnyToolResultPart;

/**
 * Creates a Schema for streaming response parts, including tools outside the
 * provided toolkit.
 *
 * @see {@link StreamPart} for a Schema restricted to the provided toolkit.
 * @category schemas
 */
export const StreamPartView = <T extends Toolkit.Any | Toolkit.WithHandler<any>>(
  toolkit: T,
): Schema.Codec<
  StreamPartView<T extends Toolkit.Any ? Toolkit.Tools<T> : Toolkit.WithHandlerTools<T>>,
  StreamPartEncoded,
  Tool.ResultDecodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>,
  Tool.ResultEncodingServices<Toolkit.Tools<T>[keyof Toolkit.Tools<T>]>
> => withAnyToolParts(StreamPart(toolkit));

/**
 * Union type for tool call parts that also accepts tools outside the provided
 * toolkit.
 *
 * @see {@link ToolCallParts} for toolkit-specific tool call parts.
 * @category utility types
 */
export type ToolCallPartsView<
  Tools extends Record<string, Tool.Any>,
  EncodedParameters extends ToolParametersMode = "decoded",
> = ToolCallParts<Tools, EncodedParameters> | AnyToolCallPart;

/**
 * Union type for tool result parts that also accepts tools outside the provided
 * toolkit.
 *
 * @see {@link ToolResultParts} for toolkit-specific tool result parts.
 * @category utility types
 */
export type ToolResultPartsView<Tools extends Record<string, Tool.Any>> =
  | ToolResultParts<Tools>
  | AnyToolResultPart;

/**
 * Union of toolkit-specific tool call and result parts.
 *
 * @category utility types
 */
export type ToolPart<
  Tools extends Record<string, Tool.Any>,
  EncodedParameters extends ToolParametersMode = "decoded",
> = ToolCallParts<Tools, EncodedParameters> | ToolResultParts<Tools>;

/**
 * Union of tool call and result parts that also accepts tools outside the
 * provided toolkit.
 *
 * @category utility types
 */
export type ToolPartView<
  Tools extends Record<string, Tool.Any>,
  EncodedParameters extends ToolParametersMode = "decoded",
> = ToolCallPartsView<Tools, EncodedParameters> | ToolResultPartsView<Tools>;

/**
 * Tool call part whose name and parameters are not restricted by a toolkit.
 *
 * @category models
 */
export type AnyToolCallPart = ToolCallPart<string, unknown>;

type RuntimeAnyToolCallPart = AnyToolCallPart & {
  readonly [AnyToolCallPartTypeId]: typeof AnyToolCallPartTypeId;
};

/**
 * Type guard to check if a value is an unrestricted tool call part.
 *
 * @category guards
 */
export const isAnyToolCallPart = (u: unknown): u is RuntimeAnyToolCallPart =>
  Predicate.hasProperty(u, AnyToolCallPartTypeId);

/**
 * Constructs a tool call part whose name and parameters are unrestricted.
 *
 * @category constructors
 */
export const anyToolCallPart = (
  params: ConstructorParams<ToolCallPart<string, unknown>>,
): AnyToolCallPart =>
  Object.assign(toolCallPart(params), {
    [AnyToolCallPartTypeId]: AnyToolCallPartTypeId,
  });

/**
 * Schema for a tool call whose name and parameters are not restricted by a
 * toolkit.
 *
 * @category schemas
 */
export const AnyToolCallPart: Schema.Codec<AnyToolCallPart, ToolCallPartEncoded> = Schema.Struct({
  [PartTypeId]: Schema.Literal(PartTypeId).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(PartTypeId), { encodingStrategy: "omit" }),
  ),
  [AnyToolCallPartTypeId]: Schema.Literal(AnyToolCallPartTypeId).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(AnyToolCallPartTypeId), {
      encodingStrategy: "omit",
    }),
  ),
  metadata: ProviderMetadata.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
}).annotate({ identifier: "AnyToolCallPart" });

/**
 * Tool result part whose name and result are not restricted by a toolkit.
 *
 * @category models
 */
export type AnyToolResultPart = ToolResultPart<string, unknown, unknown>;

type RuntimeAnyToolResultPart = AnyToolResultPart & {
  readonly [AnyToolResultPartTypeId]: typeof AnyToolResultPartTypeId;
};

/**
 * Type guard to check if a value is an unrestricted tool result part.
 *
 * @category guards
 */
export const isAnyToolResultPart = (u: unknown): u is RuntimeAnyToolResultPart =>
  Predicate.hasProperty(u, AnyToolResultPartTypeId);

/**
 * Union of unrestricted tool call and tool result parts.
 *
 * @category models
 */
export type AnyToolPart = AnyToolCallPart | AnyToolResultPart;

type RuntimeAnyToolPart = RuntimeAnyToolCallPart | RuntimeAnyToolResultPart;

/**
 * Type guard to check if a value is an unrestricted tool part.
 *
 * @category guards
 */
export const isAnyToolPart = (u: unknown): u is RuntimeAnyToolPart =>
  isAnyToolCallPart(u) || isAnyToolResultPart(u);

/**
 * Constructs a tool result part whose name and result are unrestricted.
 *
 * @category constructors
 */
export const anyToolResultPart = <
  const Params extends ConstructorParams<ToolResultPart<string, unknown, unknown>>,
>(
  params: Params,
): AnyToolResultPart =>
  Object.assign(toolResultPart(params), {
    [AnyToolResultPartTypeId]: AnyToolResultPartTypeId,
  });

/**
 * Schema for a tool result whose name and result are not restricted by a
 * toolkit.
 *
 * @category schemas
 */
export const AnyToolResultPart: Schema.Codec<AnyToolResultPart, ToolResultPartEncoded> =
  Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("tool-result"),
    isFailure: Schema.Boolean,
    name: Schema.String,
    [PartTypeId]: Schema.Literal(PartTypeId),
    [AnyToolResultPartTypeId]: Schema.Literal(AnyToolResultPartTypeId).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(AnyToolResultPartTypeId), {
        encodingStrategy: "omit",
      }),
    ),
    result: Schema.Unknown,
    providerExecuted: Schema.Boolean,
    metadata: ProviderMetadata,
    encodedResult: Schema.Unknown,
    preliminary: Schema.Boolean,
  })
    .pipe(
      Schema.encodeTo(
        Schema.Struct({
          id: Schema.String,
          type: Schema.Literal("tool-result"),
          isFailure: Schema.Boolean,
          name: Schema.String,
          result: Schema.Unknown,
          providerExecuted: Schema.optional(Schema.Boolean),
          metadata: Schema.optional(ProviderMetadata),
          preliminary: Schema.optional(Schema.Boolean),
        }),
        SchemaTransformation.transform({
          decode: (encoded) => ({
            ...encoded,
            [PartTypeId]: PartTypeId,
            providerExecuted: encoded.providerExecuted ?? false,
            metadata: encoded.metadata ?? {},
            encodedResult: encoded.result,
            preliminary: encoded.preliminary ?? false,
          }),
          encode: identity,
        }),
      ),
    )
    .annotate({ identifier: "AnyToolResultPart" });

const withAnyToolParts = <Value, Encoded, DecodingServices, EncodingServices>(
  schema: Schema.Codec<Value, Encoded, DecodingServices, EncodingServices>,
): Schema.Codec<
  Value | AnyToolCallPart | AnyToolResultPart,
  Encoded,
  DecodingServices,
  EncodingServices
> => Schema.Union([schema, AnyToolCallPart, AnyToolResultPart]) as any;
