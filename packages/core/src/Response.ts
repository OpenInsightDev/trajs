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

export * from "effect/ai/Response";

export type AnyToolCallPart = ToolCallPart<string, unknown>;

export type AnyToolResultPart = ToolResultPart<string, unknown, unknown>;

export type AllPartsView<Tools extends Record<string, Tool.Any>> =
  | AllParts<Tools>
  | AnyToolCallPart
  | AnyToolResultPart;

export type PartView<Tools extends Record<string, Tool.Any>> =
  | Part<Tools>
  | AnyToolCallPart
  | AnyToolResultPart;

export type ToolCallPartsView<Tools extends Record<string, Tool.Any>> =
  | ToolCallParts<Tools>
  | AnyToolCallPart;

export type ToolResultPartsView<Tools extends Record<string, Tool.Any>> =
  | ToolResultParts<Tools>
  | AnyToolResultPart;

/**
 * The tool call a trajectory read with `Config` states.
 *
 * **When to use**
 *
 * Use to type a call read through the toolkit of a configuration rather than through
 * the toolkit alone.
 *
 * @see {@link ToolCallPartsView} for the call read with its tools alone.
 * @category models
 */
export type ToolCallOf<Config extends Config.AnyConfig> = ToolCallPartsView<Config.ToolsOf<Config>>;

/**
 * The tool result a trajectory read with `Config` states.
 *
 * **When to use**
 *
 * Use to type a result read through the toolkit of a configuration rather than through
 * the toolkit alone.
 *
 * @see {@link ToolResultPartsView} for the result read with its tools alone.
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
 * Constructs a tool call part of a tool a toolkit does not describe.
 *
 * **When to use**
 *
 * Use where the call is built without the toolkit it will be read through.
 *
 * **Details**
 *
 * `providerExecuted` defaults to `false`, the framework executing the call.
 *
 * @see {@link anyToolResultPart} for the result that answers the call.
 * @category constructors
 */
export const anyToolCallPart = (params: AnyToolCallParams): AnyToolCallPart =>
  toolCallPart({ ...params, providerExecuted: params.providerExecuted ?? false });

/**
 * Constructs a tool result part of a tool a toolkit does not describe.
 *
 * **When to use**
 *
 * Use where the result is built without the toolkit it will be read through.
 *
 * **Details**
 *
 * `encodedResult` defaults to `result`, `preliminary` to `false`, and
 * `providerExecuted` to `false`.
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
    providerExecuted: params.providerExecuted ?? false,
  });
