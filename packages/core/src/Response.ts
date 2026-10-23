/**
 * Response parts as a trajectory holds them: the tools its toolkit names, read by
 * the schemas those tools state, and any other tool, read by the toolkit-free
 * schemas of `effect/ai/Response` with `unknown` parameters and result.
 *
 * `effect/ai/Response` types tool call and tool result parts by the tool names of a
 * toolkit, so it keeps those two readings apart: `AllParts(toolkit)` names the
 * toolkit's tools alone and `AllParts()` accepts any tool. A trajectory holds both,
 * which is what the types below state and what `Trajectory.ResponsePart` reads.
 */

import type { Tool } from "effect/ai";
import type {
  AllParts,
  ConstructorParams,
  Part,
  ToolCallPart,
  ToolCallParts,
  ToolResultPart,
  ToolResultParts,
} from "effect/ai/Response";
import { toolCallPart, toolResultPart } from "effect/ai/Response";

export * from "effect/ai/Response";

/**
 * Tool call part of a tool that no toolkit names.
 *
 * **When to use**
 *
 * Use to type a call a trajectory holds for a tool whose schema is no longer
 * available.
 *
 * @see {@link AllPartsView} for the parts of a response that hold one.
 * @category models
 */
export type AnyToolCallPart = ToolCallPart<string, unknown>;

/**
 * Tool result part of a tool that no toolkit names.
 *
 * **When to use**
 *
 * Use to type a result a trajectory holds for a tool whose schema is no longer
 * available.
 *
 * @see {@link AllPartsView} for the parts of a response that hold one.
 * @category models
 */
export type AnyToolResultPart = ToolResultPart<string, unknown, unknown>;

/**
 * Every part of a response, including the tools the toolkit does not name.
 *
 * **When to use**
 *
 * Use to type the response of a trajectory part, which is read with the toolkit of
 * the trajectory it belongs to.
 *
 * **Details**
 *
 * A tool of the toolkit keeps the name, parameters and result its schema states;
 * any other tool is read as {@link AnyToolCallPart} or {@link AnyToolResultPart}.
 *
 * @see {@link PartView} for the whole parts alone.
 * @category models
 */
export type AllPartsView<Tools extends Record<string, Tool.Any>> =
  | AllParts<Tools>
  | AnyToolCallPart
  | AnyToolResultPart;

/**
 * A whole part of a response, including the tools the toolkit does not name.
 *
 * **When to use**
 *
 * Use to type a response part a model returned whole, rather than every increment
 * a streamed response arrived in.
 *
 * @see {@link AllPartsView} for every part a response may hold.
 * @category models
 */
export type PartView<Tools extends Record<string, Tool.Any>> =
  | Part<Tools>
  | AnyToolCallPart
  | AnyToolResultPart;

/**
 * The tool call parts of a response, including the tools the toolkit does not
 * name.
 *
 * **When to use**
 *
 * Use to type the calls a trajectory holds, where the toolkit may name the tool.
 *
 * @see {@link AnyToolCallPart} for a call of a tool it does not name.
 * @category models
 */
export type ToolCallPartsView<Tools extends Record<string, Tool.Any>> =
  | ToolCallParts<Tools>
  | AnyToolCallPart;

/**
 * The tool result parts of a response, including the tools the toolkit does not
 * name.
 *
 * **When to use**
 *
 * Use to type the results a trajectory holds, where the toolkit may name the tool.
 *
 * @see {@link AnyToolResultPart} for a result of a tool it does not name.
 * @category models
 */
export type ToolResultPartsView<Tools extends Record<string, Tool.Any>> =
  | ToolResultParts<Tools>
  | AnyToolResultPart;

/**
 * The fields a tool result part for a tool no toolkit describes is built from.
 *
 * It is what {@link ConstructorParams} states, with the two fields the decoded
 * part derives rather than takes: what a result is encoded as is the result
 * itself — such a result is carried as it is — and a result is not preliminary
 * unless the caller says so. They may still be given, for a part decoded and
 * built again.
 */
type AnyToolResultParams = Omit<
  ConstructorParams<ToolResultPart<string, unknown, unknown>>,
  "encodedResult" | "preliminary"
> & {
  readonly encodedResult?: unknown;
  readonly preliminary?: boolean;
};

/**
 * Builds a tool call part for a tool that no toolkit describes.
 *
 * **When to use**
 *
 * Use to state a call a run made with a tool the toolkit of its trajectory does
 * not hold.
 *
 * **Details**
 *
 * The name and the parameters are left as stated: the part is an
 * {@link AnyToolCallPart}, the shape the toolkit-free `AllParts()` reads, rather
 * than one read by a tool's own schema.
 *
 * @category constructors
 */
export const anyToolCallPart = (params: ConstructorParams<AnyToolCallPart>): AnyToolCallPart =>
  toolCallPart(params);

/**
 * Builds a tool result part for a tool that no toolkit describes.
 *
 * **When to use**
 *
 * Use to state the result of a call a run made with a tool the toolkit of its
 * trajectory does not hold.
 *
 * **Details**
 *
 * What a result is encoded as is derived from the result, the way decoding a part
 * derives it: the two fields the decoded part holds beyond what a caller states are
 * filled in here, so the part built is the part a trajectory reads back — which is
 * what {@link Trajectory.parts} refuses a part built without them to be.
 *
 * @category constructors
 */
export const anyToolResultPart = <const Params extends AnyToolResultParams>(
  params: Params,
): AnyToolResultPart =>
  toolResultPart({
    ...params,
    encodedResult: params.encodedResult ?? params.result,
    preliminary: params.preliminary ?? false,
  });
