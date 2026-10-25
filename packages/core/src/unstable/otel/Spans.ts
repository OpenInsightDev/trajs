/**
 * Span definitions of the GenAI and MCP semantic conventions.
 *
 * Each export states the identity of a span and the attributes it carries. A base
 * span is exported under the type the registry gives it, and a provider or tool
 * refinement under its own type with a `ref` to the span it extends.
 *
 * Attributes the registry marks required are struct fields, and the rest are
 * optional. Provider refinements repeat the attributes of the span they extend,
 * so one schema decodes a refined span.
 *
 * @see [the source span definitions](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/model).
 * @stability experimental
 */

import { Schema } from "effect";

import {
  OpenAiApiType,
  OpenAiRequestServiceTier,
  OperationName,
  ProviderName,
  ResponseStatus,
} from "#/unstable/otel/Attributes.ts";
import * as Content from "#/unstable/otel/Content.ts";
import * as Groups from "#/unstable/otel/internal/groups.ts";

/**
 * Schema for the kind of a span.
 *
 * @stability experimental
 * @category schemas
 */
export const SpanKind = Schema.Literals(["client", "server", "internal", "producer", "consumer"]);

/**
 * The kind of a span.
 *
 * @see {@link SpanKind} for the schema.
 * @stability experimental
 * @category models
 */
export type SpanKind = Schema.Schema.Type<typeof SpanKind>;

/**
 * A span definition.
 *
 * @stability experimental
 * @category models
 */
export interface Span<Type extends string, Kind extends SpanKind, Attributes> {
  /** The span type the registry identifies the span by. */
  readonly type: Type;
  /** The kind the convention states for the span. */
  readonly kind: Kind;
  /** Schema for the attributes of the span. */
  readonly attributes: Schema.Schema<Attributes>;
}

/**
 * A span definition that extends another span.
 *
 * @stability experimental
 * @category models
 */
export interface SpanRefinement<
  Type extends string,
  Ref extends string,
  Kind extends SpanKind,
  Attributes,
> extends Span<Type, Kind, Attributes> {
  /** The type of the span the refinement extends. */
  readonly ref: Ref;
}

const defineSpan = <const Type extends string, const Kind extends SpanKind, Attributes>(
  type: Type,
  kind: Kind,
  attributes: Schema.Schema<Attributes>,
): Span<Type, Kind, Attributes> => ({ type, kind, attributes });

const refineSpan = <
  const Type extends string,
  const Ref extends string,
  const Kind extends SpanKind,
  Attributes,
>(
  type: Type,
  ref: Ref,
  kind: Kind,
  attributes: Schema.Schema<Attributes>,
): SpanRefinement<Type, Ref, Kind, Attributes> => ({
  type,
  ref,
  kind,
  attributes,
});

const inferenceFields = {
  ...Groups.common,
  ...Groups.addressAndPort,
  ...Groups.usage,
  ...Groups.usageBreakdown,
  ...Groups.content,
  ...Groups.error,
  ...Groups.requestOptions,
  "gen_ai.request.top_k": Schema.optional(Schema.Int),
  "gen_ai.request.stream": Schema.optional(Schema.Boolean),
  "gen_ai.request.reasoning.level": Schema.optional(Schema.String),
  "gen_ai.request.previous_response.id": Schema.optional(Schema.String),
  "gen_ai.response.id": Schema.optional(Schema.String),
  "gen_ai.response.model": Schema.optional(Schema.String),
  "gen_ai.response.finish_reasons": Schema.optional(Schema.Array(Content.FinishReason)),
  "gen_ai.response.time_to_first_chunk": Schema.optional(Schema.Number),
  "gen_ai.usage.reasoning.output_tokens": Schema.optional(Schema.Int),
  "gen_ai.prompt.name": Schema.optional(Schema.String),
  "gen_ai.prompt.version": Schema.optional(Schema.String),
  "gen_ai.conversation.id": Schema.optional(Schema.String),
  "gen_ai.conversation.compacted": Schema.optional(Schema.Boolean),
  "gen_ai.provider.name": ProviderName,
} as const;

/**
 * A client call to a model that generates a response or requests a tool call.
 *
 * @see {@link OpenAiInference} for the OpenAI refinement.
 * @see {@link AzureAiInference} for the Azure AI Inference refinement.
 * @see {@link AwsBedrockInference} for the AWS Bedrock refinement.
 * @stability experimental
 * @category models
 */
export const Inference = defineSpan(
  "gen_ai.client.inference",
  "client",
  Groups.withPromptVariables(inferenceFields),
);

/**
 * A request to a model that generates embeddings.
 *
 * @see {@link Inference} for the span that generates a response.
 * @stability experimental
 * @category models
 */
export const Embeddings = defineSpan(
  "gen_ai.embeddings.client",
  "client",
  Schema.Struct({
    ...Groups.common,
    ...Groups.addressAndPort,
    ...Groups.error,
    "gen_ai.provider.name": ProviderName,
    "gen_ai.request.encoding_formats": Schema.optional(Schema.Array(Schema.String)),
    "gen_ai.usage.input_tokens": Schema.optional(Schema.Int),
    "gen_ai.embeddings.dimension.count": Schema.optional(Schema.Int),
    "gen_ai.response.model": Schema.optional(Schema.String),
  }),
);

/**
 * A request to a service that retrieves documents for a query.
 *
 * @stability experimental
 * @category models
 */
export const Retrieval = defineSpan(
  "gen_ai.retrieval.client",
  "client",
  Schema.Struct({
    ...Groups.common,
    ...Groups.addressAndPort,
    ...Groups.error,
    "gen_ai.retrieval.query.text": Schema.optional(Schema.String),
    "gen_ai.retrieval.top_k": Schema.optional(Schema.Int),
    "gen_ai.retrieval.documents": Schema.optional(Content.RetrievalDocuments),
    "gen_ai.provider.name": Schema.optional(ProviderName),
    "gen_ai.data_source.id": Schema.optional(Schema.String),
  }),
);

const fetchResponseFields = {
  ...Groups.addressAndPort,
  ...Groups.error,
  "gen_ai.provider.name": ProviderName,
  "gen_ai.operation.name": OperationName,
  "gen_ai.response.id": Schema.String,
  "gen_ai.request.stream_cursor": Schema.optional(Schema.String),
  "gen_ai.system_instructions": Schema.optional(Content.SystemInstructions),
  "gen_ai.output.messages": Schema.optional(Content.OutputMessages),
  "gen_ai.tool.definitions": Schema.optional(Content.ToolDefinitions),
  "gen_ai.response.model": Schema.optional(Schema.String),
  "gen_ai.response.status": Schema.optional(ResponseStatus),
  "gen_ai.response.finish_reasons": Schema.optional(Schema.Array(Content.FinishReason)),
} as const;

/**
 * A request that fetches a generated response without performing inference.
 *
 * @see {@link OpenAiFetchResponse} for the OpenAI refinement.
 * @stability experimental
 * @category models
 */
export const FetchResponse = defineSpan(
  "gen_ai.fetch_response.client",
  "client",
  Schema.Struct(fetchResponseFields),
);

/**
 * A memory store or memory record operation.
 *
 * @stability experimental
 * @category models
 */
export const Memory = defineSpan(
  "gen_ai.memory.client",
  "client",
  Schema.Struct({
    "gen_ai.operation.name": OperationName,
    ...Groups.addressAndPort,
    ...Groups.error,
    "gen_ai.provider.name": Schema.optional(ProviderName),
    "gen_ai.memory.store.id": Schema.optional(Schema.String),
    "gen_ai.memory.record.id": Schema.optional(Schema.String),
    "gen_ai.memory.record.count": Schema.optional(Schema.Int),
    "gen_ai.memory.query.text": Schema.optional(Schema.String),
    "gen_ai.memory.records": Schema.optional(Content.MemoryRecords),
  }),
);

/**
 * The creation of a remote GenAI agent.
 *
 * @stability experimental
 * @category models
 */
export const CreateAgent = defineSpan(
  "gen_ai.create_agent.client",
  "client",
  Schema.Struct({
    ...Groups.common,
    ...Groups.addressAndPort,
    ...Groups.error,
    "gen_ai.provider.name": ProviderName,
    "gen_ai.agent.id": Schema.optional(Schema.String),
    "gen_ai.agent.name": Schema.optional(Schema.String),
    "gen_ai.agent.description": Schema.optional(Schema.String),
    "gen_ai.agent.version": Schema.optional(Schema.String),
    "gen_ai.system_instructions": Schema.optional(Content.SystemInstructions),
  }),
);

/**
 * The invocation of a remote GenAI agent.
 *
 * @see {@link InvokeAgentInternal} for an agent invoked in the same process.
 * @stability experimental
 * @category models
 */
export const InvokeAgentClient = defineSpan(
  "gen_ai.invoke_agent.client",
  "client",
  Schema.Struct({
    ...Groups.invokeAgentCommon,
    ...Groups.usageBreakdown,
    ...Groups.addressAndPort,
    "gen_ai.provider.name": ProviderName,
    "gen_ai.request.previous_response.id": Schema.optional(Schema.String),
    "gen_ai.agent.id": Schema.optional(Schema.String),
    "gen_ai.agent.version": Schema.optional(Schema.String),
  }),
);

/**
 * The invocation of a GenAI agent in the same process.
 *
 * @see {@link InvokeAgentClient} for an agent invoked over a remote service.
 * @stability experimental
 * @category models
 */
export const InvokeAgentInternal = defineSpan(
  "gen_ai.invoke_agent.internal",
  "internal",
  Schema.Struct(Groups.invokeAgentCommon),
);

const executeToolFields = {
  ...Groups.error,
  ...Groups.executeToolCommon,
  "gen_ai.operation.name": OperationName,
  "gen_ai.tool.call.id": Schema.optional(Schema.String),
  "gen_ai.tool.description": Schema.optional(Schema.String),
  "gen_ai.conversation.id": Schema.optional(Schema.String),
  "gen_ai.tool.call.arguments": Schema.optional(Content.ToolCallArguments),
  "gen_ai.tool.call.result": Schema.optional(Content.ToolCallResult),
} as const;

/**
 * The execution of a tool.
 *
 * @see {@link LoadSkill} for a tool that loads a skill.
 * @see {@link ReadSkillResource} for a tool that reads a skill resource.
 * @see {@link Command} for a tool that runs commands.
 * @stability experimental
 * @category models
 */
export const ExecuteTool = defineSpan(
  "gen_ai.execute_tool.internal",
  "internal",
  Schema.Struct(executeToolFields),
);

/**
 * The execution of a workflow that coordinates several agents or operations.
 *
 * @stability experimental
 * @category models
 */
export const InvokeWorkflow = defineSpan(
  "gen_ai.invoke_workflow.internal",
  "internal",
  Schema.Struct({
    ...Groups.error,
    "gen_ai.operation.name": OperationName,
    "gen_ai.workflow.name": Schema.optional(Schema.String),
    "gen_ai.conversation.id": Schema.optional(Schema.String),
    "gen_ai.input.messages": Schema.optional(Content.InputMessages),
    "gen_ai.output.messages": Schema.optional(Content.OutputMessages),
  }),
);

/**
 * The phase in which an agent plans or decomposes its task.
 *
 * @stability experimental
 * @category models
 */
export const Plan = defineSpan(
  "gen_ai.plan.internal",
  "internal",
  Schema.Struct({
    ...Groups.error,
    "gen_ai.operation.name": OperationName,
    "gen_ai.agent.name": Schema.optional(Schema.String),
  }),
);

/**
 * A request or notification observed by an MCP client.
 *
 * @see {@link McpServer} for the same operation observed by an MCP server.
 * @stability experimental
 * @category models
 */
export const McpClient = defineSpan(
  "mcp.client",
  "client",
  Groups.withPromptVariables({
    ...Groups.traceMcpCommon,
    ...Groups.mcpClientAddressAndPort,
    ...Groups.mcpClientStatus,
    "gen_ai.tool.call.arguments": Schema.optional(Content.ToolCallArguments),
    "gen_ai.tool.call.result": Schema.optional(Content.ToolCallResult),
  }),
);

/**
 * A request or notification observed by an MCP server.
 *
 * @see {@link McpClient} for the same operation observed by an MCP client.
 * @stability experimental
 * @category models
 */
export const McpServer = defineSpan(
  "mcp.server",
  "server",
  Groups.withPromptVariables({
    ...Groups.traceMcpCommon,
    ...Groups.mcpServerStatus,
    ...Groups.mcpServerAddressAndPort,
    "gen_ai.tool.call.arguments": Schema.optional(Content.ToolCallArguments),
    "gen_ai.tool.call.result": Schema.optional(Content.ToolCallResult),
  }),
);

/**
 * The OpenAI refinement of the inference span.
 *
 * @see {@link Inference} for the span it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiInference = refineSpan(
  "openai.gen_ai.client.inference",
  "gen_ai.client.inference",
  "client",
  Groups.withPromptVariables({
    ...inferenceFields,
    "gen_ai.request.model": Schema.String,
    "openai.request.service_tier": Schema.optional(OpenAiRequestServiceTier),
    ...Groups.openAiResponse,
    "openai.api.type": Schema.optional(OpenAiApiType),
  }),
);

/**
 * The OpenAI refinement of the fetch response span.
 *
 * @see {@link FetchResponse} for the span it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiFetchResponse = refineSpan(
  "openai.fetch_response.client",
  "gen_ai.fetch_response.client",
  "client",
  Schema.Struct({
    ...fetchResponseFields,
    "openai.api.type": Schema.optional(OpenAiApiType),
    ...Groups.openAiResponse,
  }),
);

/**
 * The Azure AI Inference refinement of the inference span.
 *
 * @see {@link Inference} for the span it extends.
 * @stability experimental
 * @category models
 */
export const AzureAiInference = refineSpan(
  "azure.ai.gen_ai.client.inference",
  "gen_ai.client.inference",
  "client",
  Groups.withPromptVariables({
    ...inferenceFields,
    "azure.resource_provider.namespace": Schema.optional(Schema.String),
  }),
);

/**
 * The AWS Bedrock refinement of the inference span.
 *
 * @see {@link Inference} for the span it extends.
 * @stability experimental
 * @category models
 */
export const AwsBedrockInference = refineSpan(
  "aws.bedrock.gen_ai.client.inference",
  "gen_ai.client.inference",
  "client",
  Groups.withPromptVariables({
    ...inferenceFields,
    "aws.bedrock.guardrail.id": Schema.String,
    "aws.bedrock.knowledge_base.id": Schema.optional(Schema.String),
  }),
);

/**
 * The execution of a tool that loads a skill.
 *
 * @see {@link ExecuteTool} for the span it extends.
 * @stability experimental
 * @category models
 */
export const LoadSkill = refineSpan(
  "gen_ai.execute_tool.load_skill.internal",
  "gen_ai.execute_tool.internal",
  "internal",
  Schema.Struct({
    ...executeToolFields,
    "gen_ai.skill.name": Schema.optional(Schema.String),
    "gen_ai.skill.description": Schema.optional(Schema.String),
    "gen_ai.skill.source.uri": Schema.optional(Schema.String),
  }),
);

/**
 * The execution of a tool that reads a skill resource.
 *
 * @see {@link ExecuteTool} for the span it extends.
 * @stability experimental
 * @category models
 */
export const ReadSkillResource = refineSpan(
  "gen_ai.execute_tool.read_skill_resource.internal",
  "gen_ai.execute_tool.internal",
  "internal",
  Schema.Struct({
    ...executeToolFields,
    "gen_ai.skill.name": Schema.optional(Schema.String),
    "gen_ai.skill.resource.name": Schema.optional(Schema.String),
    "gen_ai.skill.description": Schema.optional(Schema.String),
    "gen_ai.skill.source.uri": Schema.optional(Schema.String),
  }),
);

/**
 * The execution of a tool that runs one or more commands.
 *
 * @see {@link ExecuteTool} for the span it extends.
 * @stability experimental
 * @category models
 */
export const Command = refineSpan(
  "gen_ai.execute_tool.command.internal",
  "gen_ai.execute_tool.internal",
  "internal",
  Schema.Struct({
    ...executeToolFields,
    "gen_ai.skill.name": Schema.optional(Schema.String),
    "gen_ai.skill.resource.name": Schema.optional(Schema.String),
    "gen_ai.skill.description": Schema.optional(Schema.String),
    "gen_ai.skill.source.uri": Schema.optional(Schema.String),
    "process.executable.name": Schema.optional(Schema.String),
    "process.executable.path": Schema.optional(Schema.String),
    "process.exit.code": Schema.optional(Schema.Int),
  }),
);
