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

type AnyToolResultParams = Omit<
  ConstructorParams<ToolResultPart<string, unknown, unknown>>,
  "encodedResult" | "preliminary"
> & {
  readonly encodedResult?: unknown;
  readonly preliminary?: boolean;
};

export const anyToolCallPart = (params: ConstructorParams<AnyToolCallPart>): AnyToolCallPart =>
  toolCallPart(params);

export const anyToolResultPart = <const Params extends AnyToolResultParams>(
  params: Params,
): AnyToolResultPart =>
  toolResultPart({
    ...params,
    encodedResult: params.encodedResult ?? params.result,
    preliminary: params.preliminary ?? false,
  });
