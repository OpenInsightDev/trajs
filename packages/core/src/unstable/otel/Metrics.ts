/**
 * Metric definitions of the GenAI and MCP semantic conventions.
 *
 * Each export states the name, instrument, unit, and attributes of a metric. A base
 * metric is exported under the name the registry gives it, and an OpenAI refinement
 * under its own name with a `ref` to the metric it extends.
 *
 * Attributes the registry marks required are struct fields, and the rest are
 * optional. Each OpenAI refinement repeats the attributes of the metric it extends,
 * so one schema decodes a refined metric.
 *
 * @see [the source metric definitions](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/model).
 * @stability experimental
 */

import { Schema } from "effect";

import { ProviderName } from "#/unstable/otel/Attributes.ts";
import * as Groups from "#/unstable/otel/internal/groups.ts";

/**
 * Schema for the instrument a metric of the conventions is recorded with.
 *
 * @stability experimental
 * @category schemas
 */
export const MetricInstrument = Schema.Literals(["counter", "histogram"]);

/**
 * The instrument a metric of the conventions is recorded with.
 *
 * @see {@link MetricInstrument} for the schema.
 * @stability experimental
 * @category models
 */
export type MetricInstrument = Schema.Schema.Type<typeof MetricInstrument>;

/**
 * Schema for the unit of a metric.
 *
 * @stability experimental
 * @category schemas
 */
export const MetricUnit = Schema.String;

/**
 * The unit of a metric, stated in the syntax of the Unified Code for Units of
 * Measure or as a count in braces.
 *
 * @see {@link MetricUnit} for the schema.
 * @stability experimental
 * @category models
 */
export type MetricUnit = Schema.Schema.Type<typeof MetricUnit>;

/**
 * A metric definition.
 *
 * @stability experimental
 * @category models
 */
export interface Metric<
  Name extends string,
  Instrument extends MetricInstrument,
  Unit extends MetricUnit,
  Attributes,
> {
  /** The metric name the registry identifies the metric by. */
  readonly name: Name;
  /** The instrument the convention states for the metric. */
  readonly instrument: Instrument;
  /** The unit the convention states for the metric. */
  readonly unit: Unit;
  /** Schema for the attributes of the metric. */
  readonly attributes: Schema.Schema<Attributes>;
}

/**
 * A metric definition that extends another metric.
 *
 * @stability experimental
 * @category models
 */
export interface MetricRefinement<
  Name extends string,
  Ref extends string,
  Instrument extends MetricInstrument,
  Unit extends MetricUnit,
  Attributes,
> extends Metric<Name, Instrument, Unit, Attributes> {
  /** The name of the metric the refinement extends. */
  readonly ref: Ref;
}

const defineMetric = <
  const Name extends string,
  const Instrument extends MetricInstrument,
  const Unit extends MetricUnit,
  Attributes,
>(
  name: Name,
  instrument: Instrument,
  unit: Unit,
  attributes: Schema.Schema<Attributes>,
): Metric<Name, Instrument, Unit, Attributes> => ({
  name,
  instrument,
  unit,
  attributes,
});

const refineMetric = <
  const Name extends string,
  const Ref extends string,
  const Instrument extends MetricInstrument,
  const Unit extends MetricUnit,
  Attributes,
>(
  name: Name,
  ref: Ref,
  instrument: Instrument,
  unit: Unit,
  attributes: Schema.Schema<Attributes>,
): MetricRefinement<Name, Ref, Instrument, Unit, Attributes> => ({
  name,
  ref,
  instrument,
  unit,
  attributes,
});

const operationDurationFields = {
  ...Groups.metricGenAi,
  ...Groups.error,
  "gen_ai.provider.name": Schema.optional(ProviderName),
} as const;

const inferenceDurationFields = {
  ...Groups.metricGenAi,
  ...Groups.error,
} as const;

const timeToFirstChunkFields = {
  ...Groups.metricGenAi,
} as const;

const timePerOutputChunkFields = {
  ...Groups.metricGenAi,
} as const;

const serverRequestDurationFields = {
  ...Groups.metricGenAi,
  ...Groups.error,
} as const;

const serverTimePerOutputTokenFields = {
  ...Groups.metricGenAi,
} as const;

const serverTimeToFirstTokenFields = {
  ...Groups.metricGenAi,
} as const;

const workflowDurationFields = {
  ...Groups.error,
  "gen_ai.workflow.name": Schema.optional(Schema.String),
} as const;

const agentDurationFields = {
  ...Groups.error,
  ...Groups.invokedAgentInternalCommon,
} as const;

const agentCountFields = {
  "gen_ai.agent.name": Schema.optional(Schema.String),
} as const;

const executeToolDurationFields = {
  ...Groups.error,
  ...Groups.executeToolCommon,
} as const;

const inferenceUsageFields = {
  ...Groups.metricGenAiInferenceUsage,
} as const;

const inferenceOperationTokensFields = {
  ...Groups.metricGenAi,
  ...Groups.error,
} as const;

const mcpClientOperationDurationFields = {
  ...Groups.mcpOperationMetric,
  ...Groups.mcpClientStatus,
  ...Groups.mcpClientAddressAndPort,
} as const;

const mcpServerOperationDurationFields = {
  ...Groups.mcpOperationMetric,
  ...Groups.mcpServerStatus,
} as const;

const mcpClientSessionDurationFields = {
  ...Groups.mcpSessionMetric,
  ...Groups.mcpClientAddressAndPort,
} as const;

const mcpServerSessionDurationFields = {
  ...Groups.mcpSessionMetric,
} as const;

const openAiFields = {
  ...Groups.openAiResponse,
} as const;

/**
 * The duration of a GenAI client operation other than inference.
 *
 * @see {@link ClientInferenceDuration} for the duration of an inference operation.
 * @stability experimental
 * @category models
 */
export const ClientOperationDuration = defineMetric(
  "gen_ai.client.operation.duration",
  "histogram",
  "s",
  Schema.Struct(operationDurationFields),
);

/**
 * The end-to-end duration of a model inference operation.
 *
 * @see {@link ClientOperationDuration} for operations other than inference.
 * @stability experimental
 * @category models
 */
export const ClientInferenceDuration = defineMetric(
  "gen_ai.client.inference.duration",
  "histogram",
  "s",
  Schema.Struct(inferenceDurationFields),
);

/**
 * The time from issuing a streaming request to receiving its first chunk.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceTimeToFirstChunk = defineMetric(
  "gen_ai.client.inference.time_to_first_chunk",
  "histogram",
  "s",
  Schema.Struct(timeToFirstChunkFields),
);

/**
 * The time between output chunks after the first one.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceTimePerOutputChunk = defineMetric(
  "gen_ai.client.inference.time_per_output_chunk",
  "histogram",
  "s",
  Schema.Struct(timePerOutputChunkFields),
);

/**
 * The duration of a request as observed by a GenAI server.
 *
 * @stability experimental
 * @category models
 */
export const ServerRequestDuration = defineMetric(
  "gen_ai.server.request.duration",
  "histogram",
  "s",
  Schema.Struct(serverRequestDurationFields),
);

/**
 * The time per output token generated after the first token.
 *
 * @stability experimental
 * @category models
 */
export const ServerTimePerOutputToken = defineMetric(
  "gen_ai.server.time_per_output_token",
  "histogram",
  "s",
  Schema.Struct(serverTimePerOutputTokenFields),
);

/**
 * The time to generate the first output token.
 *
 * @stability experimental
 * @category models
 */
export const ServerTimeToFirstToken = defineMetric(
  "gen_ai.server.time_to_first_token",
  "histogram",
  "s",
  Schema.Struct(serverTimeToFirstTokenFields),
);

/**
 * The end-to-end duration of a workflow that coordinates several operations.
 *
 * @stability experimental
 * @category models
 */
export const InvokeWorkflowDuration = defineMetric(
  "gen_ai.invoke_workflow.duration",
  "histogram",
  "s",
  Schema.Struct(workflowDurationFields),
);

/**
 * The end-to-end duration of one in-process agent invocation.
 *
 * @stability experimental
 * @category models
 */
export const InvokeAgentDuration = defineMetric(
  "gen_ai.invoke_agent.duration",
  "histogram",
  "s",
  Schema.Struct(agentDurationFields),
);

/**
 * The number of inference calls an agent makes during one invocation.
 *
 * @stability experimental
 * @category models
 */
export const InvokeAgentInferenceCalls = defineMetric(
  "gen_ai.invoke_agent.inference_calls",
  "histogram",
  "{inference_call}",
  Schema.Struct(agentCountFields),
);

/**
 * The number of tool calls an agent makes during one invocation.
 *
 * @stability experimental
 * @category models
 */
export const InvokeAgentToolCalls = defineMetric(
  "gen_ai.invoke_agent.tool_calls",
  "histogram",
  "{tool_call}",
  Schema.Struct(agentCountFields),
);

/**
 * The duration of one tool execution.
 *
 * @stability experimental
 * @category models
 */
export const ExecuteToolDuration = defineMetric(
  "gen_ai.execute_tool.duration",
  "histogram",
  "s",
  Schema.Struct(executeToolDurationFields),
);

/**
 * The number of input tokens used by inference, including cached tokens.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceUsageInputTokens = defineMetric(
  "gen_ai.client.inference.usage.input_tokens",
  "counter",
  "{token}",
  Schema.Struct(inferenceUsageFields),
);

/**
 * The number of output tokens produced by inference, including reasoning tokens.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceUsageOutputTokens = defineMetric(
  "gen_ai.client.inference.usage.output_tokens",
  "counter",
  "{token}",
  Schema.Struct(inferenceUsageFields),
);

/**
 * The number of input tokens served from a provider-managed cache.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceUsageCacheReadInputTokens = defineMetric(
  "gen_ai.client.inference.usage.cache_read.input_tokens",
  "counter",
  "{token}",
  Schema.Struct(inferenceUsageFields),
);

/**
 * The number of input tokens written to a provider-managed cache.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceUsageCacheWriteInputTokens = defineMetric(
  "gen_ai.client.inference.usage.cache_write.input_tokens",
  "counter",
  "{token}",
  Schema.Struct(inferenceUsageFields),
);

/**
 * The number of output tokens used for reasoning.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceUsageReasoningOutputTokens = defineMetric(
  "gen_ai.client.inference.usage.reasoning.output_tokens",
  "counter",
  "{token}",
  Schema.Struct(inferenceUsageFields),
);

/**
 * The number of input tokens used by one inference operation.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceOperationInputTokens = defineMetric(
  "gen_ai.client.inference.operation.input_tokens",
  "histogram",
  "{token}",
  Schema.Struct(inferenceOperationTokensFields),
);

/**
 * The number of output tokens produced by one inference operation.
 *
 * @stability experimental
 * @category models
 */
export const ClientInferenceOperationOutputTokens = defineMetric(
  "gen_ai.client.inference.operation.output_tokens",
  "histogram",
  "{token}",
  Schema.Struct(inferenceOperationTokensFields),
);

/**
 * The duration of an MCP request or notification as observed by an MCP client.
 *
 * @see {@link McpServerOperationDuration} for the same operation observed by a server.
 * @stability experimental
 * @category models
 */
export const McpClientOperationDuration = defineMetric(
  "mcp.client.operation.duration",
  "histogram",
  "s",
  Groups.withPromptVariables(mcpClientOperationDurationFields),
);

/**
 * The duration of an MCP request or notification as observed by an MCP server.
 *
 * @see {@link McpClientOperationDuration} for the same operation observed by a client.
 * @stability experimental
 * @category models
 */
export const McpServerOperationDuration = defineMetric(
  "mcp.server.operation.duration",
  "histogram",
  "s",
  Groups.withPromptVariables(mcpServerOperationDurationFields),
);

/**
 * The duration of an MCP session as observed by an MCP client.
 *
 * @see {@link McpServerSessionDuration} for the same session observed by a server.
 * @stability experimental
 * @category models
 */
export const McpClientSessionDuration = defineMetric(
  "mcp.client.session.duration",
  "histogram",
  "s",
  Schema.Struct(mcpClientSessionDurationFields),
);

/**
 * The duration of an MCP session as observed by an MCP server.
 *
 * @see {@link McpClientSessionDuration} for the same session observed by a client.
 * @stability experimental
 * @category models
 */
export const McpServerSessionDuration = defineMetric(
  "mcp.server.session.duration",
  "histogram",
  "s",
  Schema.Struct(mcpServerSessionDurationFields),
);

/**
 * The OpenAI refinement of the client operation duration metric.
 *
 * @see {@link ClientOperationDuration} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiClientOperationDuration = refineMetric(
  "openai.client.operation.duration",
  "gen_ai.client.operation.duration",
  "histogram",
  "s",
  Schema.Struct({ ...operationDurationFields, ...openAiFields }),
);

/**
 * The OpenAI refinement of the inference duration metric.
 *
 * @see {@link ClientInferenceDuration} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiClientInferenceDuration = refineMetric(
  "openai.gen_ai.client.inference.duration",
  "gen_ai.client.inference.duration",
  "histogram",
  "s",
  Schema.Struct({ ...inferenceDurationFields, ...openAiFields }),
);

/**
 * The OpenAI refinement of the input token usage metric.
 *
 * @see {@link ClientInferenceUsageInputTokens} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiInferenceUsageInputTokens = refineMetric(
  "openai.gen_ai.client.inference.usage.input_tokens",
  "gen_ai.client.inference.usage.input_tokens",
  "counter",
  "{token}",
  Schema.Struct({ ...inferenceUsageFields, ...openAiFields }),
);

/**
 * The OpenAI refinement of the output token usage metric.
 *
 * @see {@link ClientInferenceUsageOutputTokens} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiInferenceUsageOutputTokens = refineMetric(
  "openai.gen_ai.client.inference.usage.output_tokens",
  "gen_ai.client.inference.usage.output_tokens",
  "counter",
  "{token}",
  Schema.Struct({ ...inferenceUsageFields, ...openAiFields }),
);

/**
 * The OpenAI refinement of the cache read token usage metric.
 *
 * @see {@link ClientInferenceUsageCacheReadInputTokens} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiInferenceUsageCacheReadInputTokens = refineMetric(
  "openai.gen_ai.client.inference.usage.cache_read.input_tokens",
  "gen_ai.client.inference.usage.cache_read.input_tokens",
  "counter",
  "{token}",
  Schema.Struct({ ...inferenceUsageFields, ...openAiFields }),
);

/**
 * The OpenAI refinement of the cache write token usage metric.
 *
 * @see {@link ClientInferenceUsageCacheWriteInputTokens} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiInferenceUsageCacheWriteInputTokens = refineMetric(
  "openai.gen_ai.client.inference.usage.cache_write.input_tokens",
  "gen_ai.client.inference.usage.cache_write.input_tokens",
  "counter",
  "{token}",
  Schema.Struct({ ...inferenceUsageFields, ...openAiFields }),
);

/**
 * The OpenAI refinement of the reasoning token usage metric.
 *
 * @see {@link ClientInferenceUsageReasoningOutputTokens} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiInferenceUsageReasoningOutputTokens = refineMetric(
  "openai.gen_ai.client.inference.usage.reasoning.output_tokens",
  "gen_ai.client.inference.usage.reasoning.output_tokens",
  "counter",
  "{token}",
  Schema.Struct({ ...inferenceUsageFields, ...openAiFields }),
);

/**
 * The OpenAI refinement of the per-operation input token metric.
 *
 * @see {@link ClientInferenceOperationInputTokens} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiInferenceOperationInputTokens = refineMetric(
  "openai.gen_ai.client.inference.operation.input_tokens",
  "gen_ai.client.inference.operation.input_tokens",
  "histogram",
  "{token}",
  Schema.Struct({ ...inferenceOperationTokensFields, ...openAiFields }),
);

/**
 * The OpenAI refinement of the per-operation output token metric.
 *
 * @see {@link ClientInferenceOperationOutputTokens} for the metric it extends.
 * @stability experimental
 * @category models
 */
export const OpenAiInferenceOperationOutputTokens = refineMetric(
  "openai.gen_ai.client.inference.operation.output_tokens",
  "gen_ai.client.inference.operation.output_tokens",
  "histogram",
  "{token}",
  Schema.Struct({ ...inferenceOperationTokensFields, ...openAiFields }),
);
