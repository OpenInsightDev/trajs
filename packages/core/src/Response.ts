/**
 * Effect response parts and views accepting undeclared tools.
 *
 * {@link anyToolCallPart} and {@link anyToolResultPart} construct parts without a toolkit.
 * View types retain known tools while accepting unknown tool payloads.
 *
 * @stability stable
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

import type * as Config from "#/Config.ts";

/**
 * Re-exports Effect's response APIs without modification.
 *
 * @stability stable
 * @category re-exports
 */
export * from "effect/ai/Response";

/**
 * A {@link ToolCallPart} without a declared tool name or parameter schema.
 *
 * @see {@link anyToolCallPart} for construction.
 * @stability stable
 * @category models
 */
export type AnyToolCallPart = ToolCallPart<string, unknown>;

/**
 * A {@link ToolResultPart} without a declared tool name or result schema.
 *
 * @see {@link anyToolResultPart} for construction.
 * @stability stable
 * @category models
 */
export type AnyToolResultPart = ToolResultPart<string, unknown, unknown>;

/**
 * Streaming and finished response parts, including undeclared tool calls and results.
 *
 * **Gotchas**
 *
 * A tool name alone cannot prove a payload follows a known tool's schema.
 * The undeclared-tool variants also accept known names.
 *
 * @see {@link PartView} for finished parts only.
 * @stability stable
 * @category models
 */
export type AllPartsView<Tools extends Record<string, Tool.Any>> =
  | AllParts<Tools>
  | AnyToolCallPart
  | AnyToolResultPart;

/**
 * Finished response parts, including undeclared tool calls and results.
 *
 * @see {@link AllPartsView} for streaming increments and tool-name narrowing limits.
 * @stability stable
 * @category models
 */
export type PartView<Tools extends Record<string, Tool.Any>> =
  | Part<Tools>
  | AnyToolCallPart
  | AnyToolResultPart;

/**
 * Tool calls accepting both declared and undeclared parameter payloads.
 *
 * @see {@link AllPartsView} for tool-name narrowing limits.
 * @see {@link ToolCallOf} for calls typed through a config.
 * @stability stable
 * @category models
 */
export type ToolCallPartsView<Tools extends Record<string, Tool.Any>> =
  | ToolCallParts<Tools>
  | AnyToolCallPart;

/**
 * Tool results accepting both declared and undeclared result payloads.
 *
 * @see {@link AllPartsView} for tool-name narrowing limits.
 * @see {@link ToolResultOf} for results typed through a config.
 * @stability stable
 * @category models
 */
export type ToolResultPartsView<Tools extends Record<string, Tool.Any>> =
  | ToolResultParts<Tools>
  | AnyToolResultPart;

/**
 * A tool call read through a config, including calls to undeclared tools.
 *
 * @see {@link ToolCallPartsView} for calls typed through tool declarations alone.
 * @stability stable
 * @category models
 */
export type ToolCallOf<Config extends Config.AnyConfig> = ToolCallPartsView<Config.ToolsOf<Config>>;

/**
 * A tool result read through a config, including results from undeclared tools.
 *
 * @see {@link ToolResultPartsView} for results typed through tool declarations alone.
 * @stability stable
 * @category models
 */
export type ToolResultOf<Config extends Config.AnyConfig> = ToolResultPartsView<
  Config.ToolsOf<Config>
>;

type AnyToolCallParams = Omit<ConstructorParams<AnyToolCallPart>, "providerExecuted"> & {
  readonly providerExecuted?: boolean;
};

type AnyToolResultParams = Omit<
  ConstructorParams<ToolResultPart<string, unknown, unknown>>,
  "encodedResult" | "preliminary" | "providerExecuted"
> & {
  readonly encodedResult?: unknown;
  readonly preliminary?: boolean;
  readonly providerExecuted?: boolean;
};

/**
 * Creates a tool call without requiring a tool declaration.
 *
 * **When to use**
 *
 * Use when importing calls without their original toolkit.
 *
 * **Details**
 *
 * `providerExecuted` defaults to `false`.
 * Parameters are not validated against a tool schema.
 *
 * @see {@link anyToolResultPart} for constructing the corresponding result.
 * @stability stable
 * @category constructors
 */
export const anyToolCallPart = (params: AnyToolCallParams): AnyToolCallPart =>
  toolCallPart({ ...params, providerExecuted: params.providerExecuted ?? false });

/**
 * Creates a tool result without requiring a tool declaration.
 *
 * **When to use**
 *
 * Use when importing results without their original toolkit.
 *
 * **Details**
 *
 * - `encodedResult` defaults to `result`.
 * - `preliminary` defaults to `false`.
 * - `providerExecuted` defaults to `false`.
 *
 * **Gotchas**
 *
 * A `null` encoded result also falls back to `result`.
 * Results are not validated against a tool schema.
 *
 * @see {@link anyToolCallPart} for constructing the corresponding call.
 * @stability stable
 * @category constructors
 */
export const anyToolResultPart = <const Params extends AnyToolResultParams>(
  params: Params,
): AnyToolResultPart =>
  toolResultPart({
    ...params,
    encodedResult: params.encodedResult ?? params.result,
    preliminary: params.preliminary ?? false,
    providerExecuted: params.providerExecuted ?? false,
  });
