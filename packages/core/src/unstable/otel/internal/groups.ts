/**
 * Attribute groups shared by the GenAI and MCP signals.
 *
 * A group is a set of attribute fields a span, metric, or event composes. Required
 * attributes are struct fields, and attributes the registry recommends, marks
 * opt-in, or requires conditionally are optional fields.
 */

import { Schema } from "effect";

import {
  McpMethodName,
  OperationName,
  OutputType,
  PromptVariables,
  ProviderName,
  TokenModality,
} from "#/unstable/otel/Attributes.ts";
import * as Content from "#/unstable/otel/Content.ts";

/**
 * Builds an attributes struct that accepts prompt variables as well as its fields.
 *
 * Any other attribute not named by the fields is dropped.
 */
export const withPromptVariables = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [PromptVariables]);

export const common = {
  "gen_ai.request.model": Schema.optional(Schema.String),
  "gen_ai.operation.name": OperationName,
} as const;

export const addressAndPort = {
  "server.address": Schema.optional(Schema.String),
  "server.port": Schema.optional(Schema.Int),
} as const;

export const usage = {
  "gen_ai.usage.input_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.output_tokens": Schema.optional(Schema.Int),
} as const;

export const usageBreakdown = {
  "gen_ai.usage.text.input_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.image.input_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.audio.input_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.text.cache_read.input_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.image.cache_read.input_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.audio.cache_read.input_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.text.output_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.image.output_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.audio.output_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.cache_read.input_tokens": Schema.optional(Schema.Int),
  "gen_ai.usage.cache_write.input_tokens": Schema.optional(Schema.Int),
} as const;

export const content = {
  "gen_ai.system_instructions": Schema.optional(Content.SystemInstructions),
  "gen_ai.input.messages": Schema.optional(Content.InputMessages),
  "gen_ai.output.messages": Schema.optional(Content.OutputMessages),
  "gen_ai.tool.definitions": Schema.optional(Content.ToolDefinitions),
} as const;

export const error = {
  "error.type": Schema.optional(Schema.String),
} as const;

export const requestOptions = {
  "gen_ai.request.max_tokens": Schema.optional(Schema.Int),
  "gen_ai.request.choice.count": Schema.optional(Schema.Int),
  "gen_ai.request.temperature": Schema.optional(Schema.Number),
  "gen_ai.request.top_p": Schema.optional(Schema.Number),
  "gen_ai.request.stop_sequences": Schema.optional(Schema.Array(Schema.String)),
  "gen_ai.request.frequency_penalty": Schema.optional(Schema.Number),
  "gen_ai.request.presence_penalty": Schema.optional(Schema.Number),
  "gen_ai.request.seed": Schema.optional(Schema.Int),
  "gen_ai.output.type": Schema.optional(OutputType),
} as const;

export const invokedAgentInternalCommon = {
  "gen_ai.agent.name": Schema.optional(Schema.String),
  "gen_ai.request.model": Schema.optional(Schema.String),
} as const;

export const invokeAgentCommon = {
  ...usage,
  ...content,
  ...error,
  ...invokedAgentInternalCommon,
  ...requestOptions,
  "gen_ai.operation.name": OperationName,
  "gen_ai.response.finish_reasons": Schema.optional(Schema.Array(Content.FinishReason)),
  "gen_ai.conversation.id": Schema.optional(Schema.String),
  "gen_ai.data_source.id": Schema.optional(Schema.String),
  "gen_ai.agent.description": Schema.optional(Schema.String),
} as const;

export const executeToolCommon = {
  "gen_ai.tool.name": Schema.String,
  "gen_ai.tool.type": Schema.optional(Schema.String),
  "gen_ai.agent.name": Schema.optional(Schema.String),
} as const;

export const mcpNetworkProtocol = {
  "network.transport": Schema.optional(Schema.String),
  "network.protocol.name": Schema.optional(Schema.String),
  "jsonrpc.protocol.version": Schema.optional(Schema.String),
  "network.protocol.version": Schema.optional(Schema.String),
} as const;

export const mcpCommon = {
  "gen_ai.tool.name": Schema.optional(Schema.String),
  "gen_ai.operation.name": Schema.optional(OperationName),
  "gen_ai.prompt.name": Schema.optional(Schema.String),
  "error.type": Schema.optional(Schema.String),
  "mcp.method.name": McpMethodName,
  "mcp.protocol.version": Schema.optional(Schema.String),
  ...mcpNetworkProtocol,
} as const;

export const mcpClientStatus = {
  "rpc.response.status_code": Schema.optional(Schema.String),
} as const;

export const mcpServerStatus = {
  "rpc.response.status_code": Schema.optional(Schema.String),
} as const;

export const mcpClientAddressAndPort = {
  "server.address": Schema.optional(Schema.String),
  "server.port": Schema.optional(Schema.Int),
} as const;

export const mcpServerAddressAndPort = {
  "client.address": Schema.optional(Schema.String),
  "client.port": Schema.optional(Schema.Int),
} as const;

export const traceMcpCommon = {
  ...mcpCommon,
  "mcp.session.id": Schema.optional(Schema.String),
  "mcp.resource.uri": Schema.optional(Schema.String),
  "jsonrpc.request.id": Schema.optional(Schema.String),
} as const;

export const metricGenAi = {
  ...addressAndPort,
  ...common,
  "gen_ai.response.model": Schema.optional(Schema.String),
  "gen_ai.provider.name": ProviderName,
} as const;

export const metricGenAiInferenceUsage = {
  ...metricGenAi,
  "gen_ai.token.modality": TokenModality,
} as const;

export const mcpOperationMetric = {
  ...mcpCommon,
  "mcp.resource.uri": Schema.optional(Schema.String),
} as const;

export const mcpSessionMetric = {
  "mcp.protocol.version": Schema.optional(Schema.String),
  "network.protocol.name": Schema.optional(Schema.String),
  "jsonrpc.protocol.version": Schema.optional(Schema.String),
  "error.type": Schema.optional(Schema.String),
} as const;

export const openAiResponse = {
  "openai.response.service_tier": Schema.optional(Schema.String),
  "openai.response.system_fingerprint": Schema.optional(Schema.String),
} as const;
