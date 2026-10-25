/**
 * Attribute values and enumerations of the GenAI, MCP, and provider registries.
 *
 * {@link AttributeValue} is the value model of an OpenTelemetry attribute, and
 * {@link Attributes} the map a span, event, or metric carries. The remaining
 * exports are the enumerated attributes of the registry, stated as open
 * enumerations: the listed values are the ones the registry names, and any
 * other string is accepted because instrumentation may report a
 * provider-specific value.
 *
 * @see [the source registries](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/model).
 * @stability experimental
 */

import { Schema } from "effect";

import { openEnum } from "#/unstable/otel/internal/enum.ts";

/**
 * Schema for the value of an OpenTelemetry attribute.
 *
 * **Details**
 *
 * A value is a scalar or a homogeneous array of scalars.
 * Integers may be numbers within the safe range or bigints beyond it.
 * Byte arrays are accepted for binary values.
 *
 * @stability experimental
 * @category schemas
 */
export const AttributeValue = Schema.Union([
  Schema.String,
  Schema.Boolean,
  Schema.Int,
  Schema.Number,
  Schema.BigInt,
  Schema.Uint8Array,
  Schema.Array(Schema.String),
  Schema.Array(Schema.Boolean),
  Schema.Array(Schema.Int),
  Schema.Array(Schema.Number),
  Schema.Array(Schema.BigInt),
]);

/**
 * One OpenTelemetry attribute value.
 *
 * @see {@link AttributeValue} for the schema.
 * @stability experimental
 * @category models
 */
export type AttributeValue = Schema.Schema.Type<typeof AttributeValue>;

/**
 * Schema for a map of attribute names to values.
 *
 * @stability experimental
 * @category schemas
 */
export const Attributes = Schema.Record(Schema.String, AttributeValue);

/**
 * A map of attribute names to values.
 *
 * @see {@link Attributes} for the schema.
 * @stability experimental
 * @category models
 */
export type Attributes = Schema.Schema.Type<typeof Attributes>;

/**
 * Schema for the values of the variables a prompt template was given.
 *
 * **Details**
 *
 * A variable is recorded as one attribute whose name is the variable name
 * appended to `gen_ai.prompt.variable.`, as {@link promptVariableKey} states.
 *
 * @see {@link promptVariableKey} for the attribute name of a variable.
 * @stability experimental
 * @category schemas
 */
export const PromptVariables = Schema.Record(
  Schema.TemplateLiteral(["gen_ai.prompt.variable.", Schema.String]),
  Schema.String,
);

/**
 * The values of the variables a prompt template was given, keyed by attribute name.
 *
 * @see {@link PromptVariables} for the schema.
 * @stability experimental
 * @category models
 */
export type PromptVariables = Schema.Schema.Type<typeof PromptVariables>;

/**
 * Returns the attribute name a prompt template variable is recorded under.
 *
 * **Example** (Naming a variable)
 *
 * ```ts
 * promptVariableKey("user_name"); // => "gen_ai.prompt.variable.user_name"
 * ```
 *
 * @see {@link PromptVariables} for the variable values.
 * @stability experimental
 * @category constructors
 */
export const promptVariableKey = (name: string): `gen_ai.prompt.variable.${string}` =>
  `gen_ai.prompt.variable.${name}`;

/**
 * Schema for `gen_ai.provider.name`.
 *
 * **Details**
 *
 * Known values are `openai`, `gcp.gen_ai`, `gcp.vertex_ai`, `gcp.gemini`,
 * `anthropic`, `cohere`, `azure.ai.inference`, `azure.ai.openai`,
 * `ibm.watsonx.ai`, `aws.bedrock`, `perplexity`, `x_ai`, `deepseek`, `groq`,
 * `mistral`, and `moonshot_ai`.
 *
 * @stability experimental
 * @category schemas
 */
export const ProviderName = openEnum([
  "openai",
  "gcp.gen_ai",
  "gcp.vertex_ai",
  "gcp.gemini",
  "anthropic",
  "cohere",
  "azure.ai.inference",
  "azure.ai.openai",
  "ibm.watsonx.ai",
  "aws.bedrock",
  "perplexity",
  "x_ai",
  "deepseek",
  "groq",
  "mistral",
  "moonshot_ai",
]);

/**
 * A Generative AI provider name.
 *
 * @see {@link ProviderName} for the schema.
 * @stability experimental
 * @category models
 */
export type ProviderName = Schema.Schema.Type<typeof ProviderName>;

/**
 * Schema for `gen_ai.operation.name`.
 *
 * **Details**
 *
 * Known values are `chat`, `generate_content`, `text_completion`, `embeddings`,
 * `retrieval`, `fetch_response`, `create_agent`, `invoke_agent`,
 * `execute_tool`, `invoke_workflow`, `plan`, `search_memory`, `create_memory`,
 * `update_memory`, `upsert_memory`, `delete_memory`, `create_memory_store`,
 * and `delete_memory_store`.
 *
 * @stability experimental
 * @category schemas
 */
export const OperationName = openEnum([
  "chat",
  "generate_content",
  "text_completion",
  "embeddings",
  "retrieval",
  "fetch_response",
  "create_agent",
  "invoke_agent",
  "execute_tool",
  "invoke_workflow",
  "plan",
  "search_memory",
  "create_memory",
  "update_memory",
  "upsert_memory",
  "delete_memory",
  "create_memory_store",
  "delete_memory_store",
]);

/**
 * A Generative AI operation name.
 *
 * @see {@link OperationName} for the schema.
 * @stability experimental
 * @category models
 */
export type OperationName = Schema.Schema.Type<typeof OperationName>;

/**
 * Schema for `gen_ai.output.type`.
 *
 * **Details**
 *
 * Known values are `text`, `json`, `image`, and `speech`.
 *
 * @stability experimental
 * @category schemas
 */
export const OutputType = openEnum(["text", "json", "image", "speech"]);

/**
 * A requested output modality.
 *
 * @see {@link OutputType} for the schema.
 * @stability experimental
 * @category models
 */
export type OutputType = Schema.Schema.Type<typeof OutputType>;

/**
 * Schema for `gen_ai.response.status`.
 *
 * **Details**
 *
 * Known values are `queued`, `in_progress`, `completed`, `incomplete`,
 * `failed`, and `cancelled`.
 *
 * @stability experimental
 * @category schemas
 */
export const ResponseStatus = openEnum([
  "queued",
  "in_progress",
  "completed",
  "incomplete",
  "failed",
  "cancelled",
]);

/**
 * A lifecycle status of a generated response.
 *
 * @see {@link ResponseStatus} for the schema.
 * @stability experimental
 * @category models
 */
export type ResponseStatus = Schema.Schema.Type<typeof ResponseStatus>;

/**
 * Schema for `gen_ai.token.modality`.
 *
 * **Details**
 *
 * Known values are `text`, `image`, `audio`, and `unknown`.
 *
 * @stability experimental
 * @category schemas
 */
export const TokenModality = openEnum(["text", "image", "audio", "unknown"]);

/**
 * A modality of counted tokens.
 *
 * @see {@link TokenModality} for the schema.
 * @stability experimental
 * @category models
 */
export type TokenModality = Schema.Schema.Type<typeof TokenModality>;

/**
 * Schema for `mcp.method.name`.
 *
 * **Details**
 *
 * The known values are the request and notification methods of the Model
 * Context Protocol, such as `initialize`, `tools/list`, `tools/call`,
 * `resources/read`, and `sampling/createMessage`.
 *
 * @stability experimental
 * @category schemas
 */
export const McpMethodName = openEnum([
  "notifications/cancelled",
  "initialize",
  "notifications/initialized",
  "notifications/progress",
  "ping",
  "resources/list",
  "resources/templates/list",
  "resources/read",
  "notifications/resources/list_changed",
  "resources/subscribe",
  "resources/unsubscribe",
  "notifications/resources/updated",
  "prompts/list",
  "prompts/get",
  "notifications/prompts/list_changed",
  "tools/list",
  "tools/call",
  "notifications/tools/list_changed",
  "logging/setLevel",
  "notifications/message",
  "sampling/createMessage",
  "completion/complete",
  "roots/list",
  "notifications/roots/list_changed",
  "elicitation/create",
]);

/**
 * An MCP request or notification method.
 *
 * @see {@link McpMethodName} for the schema.
 * @stability experimental
 * @category models
 */
export type McpMethodName = Schema.Schema.Type<typeof McpMethodName>;

/**
 * Schema for `openai.request.service_tier`.
 *
 * **Details**
 *
 * Known values are `auto` and `default`.
 *
 * @stability experimental
 * @category schemas
 */
export const OpenAiRequestServiceTier = openEnum(["auto", "default"]);

/**
 * A service tier requested from OpenAI.
 *
 * @see {@link OpenAiRequestServiceTier} for the schema.
 * @stability experimental
 * @category models
 */
export type OpenAiRequestServiceTier = Schema.Schema.Type<typeof OpenAiRequestServiceTier>;

/**
 * Schema for `openai.api.type`.
 *
 * **Details**
 *
 * Known values are `chat_completions` and `responses`.
 *
 * @stability experimental
 * @category schemas
 */
export const OpenAiApiType = openEnum(["chat_completions", "responses"]);

/**
 * A type of OpenAI API.
 *
 * @see {@link OpenAiApiType} for the schema.
 * @stability experimental
 * @category models
 */
export type OpenAiApiType = Schema.Schema.Type<typeof OpenAiApiType>;
