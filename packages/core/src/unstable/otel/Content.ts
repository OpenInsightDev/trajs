/**
 * GenAI message, tool, retrieval, and memory payloads.
 *
 * These schemas describe the values of the `gen_ai.*` attributes the registry
 * types as `any`. {@link InputMessages} and {@link OutputMessages} carry the
 * conversation; {@link SystemInstructions} the instructions given apart from
 * it; {@link ToolDefinitions} the tools a model was offered; and the remaining
 * schemas the payloads of retrieval and memory operations.
 *
 * Every object accepts and preserves properties the registry does not model, so
 * a provider-specific field survives a decode.
 *
 * @see [the source JSON schemas](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/model/gen-ai).
 * @stability experimental
 */

import { Schema } from "effect";

import { openEnum } from "#/unstable/otel/internal/enum.ts";

/** A schema for an object with standard fields and provider-defined properties. */
const extensible = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [Schema.Record(Schema.String, Schema.Unknown)]);

/**
 * Schema for the role of the entity that created a message.
 *
 * **Details**
 *
 * The known roles are `system`, `user`, `assistant`, and `tool`.
 * A provider-specific role is accepted as any other string.
 *
 * @stability experimental
 * @category schemas
 */
export const Role = openEnum(["system", "user", "assistant", "tool"]);

/**
 * A message role, known or provider-specific.
 *
 * @see {@link Role} for the schema.
 * @stability experimental
 * @category models
 */
export type Role = Schema.Schema.Type<typeof Role>;

/**
 * Schema for the general modality of attached data.
 *
 * **Details**
 *
 * The known modalities are `image`, `video`, `audio`, and `document`.
 * A provider-specific modality is accepted as any other string.
 *
 * @stability experimental
 * @category schemas
 */
export const Modality = openEnum(["image", "video", "audio", "document"]);

/**
 * An attachment modality, known or provider-specific.
 *
 * @see {@link Modality} for the schema.
 * @stability experimental
 * @category models
 */
export type Modality = Schema.Schema.Type<typeof Modality>;

/**
 * Schema for the reason a generation finished.
 *
 * **Details**
 *
 * The known reasons are `stop`, `length`, `content_filter`, `tool_call`,
 * `compaction`, and `error`.
 * A provider-specific reason is accepted as any other string.
 *
 * @stability experimental
 * @category schemas
 */
export const FinishReason = openEnum([
  "stop",
  "length",
  "content_filter",
  "tool_call",
  "compaction",
  "error",
]);

/**
 * A generation finish reason, known or provider-specific.
 *
 * @see {@link FinishReason} for the schema.
 * @stability experimental
 * @category models
 */
export type FinishReason = Schema.Schema.Type<typeof FinishReason>;

/**
 * Schema for text sent to or received from a model.
 *
 * @see {@link Part} for the message part union.
 * @stability experimental
 * @category schemas
 */
export const TextPart = extensible({
  type: Schema.Literal("text"),
  content: Schema.String,
});

/**
 * Text within a message or a system instruction.
 *
 * @see {@link TextPart} for the schema.
 * @stability experimental
 * @category models
 */
export type TextPart = Schema.Schema.Type<typeof TextPart>;

/**
 * Schema for a tool call requested by a model.
 *
 * **Details**
 *
 * `arguments` holds the payload as the provider stated it.
 * The registry expects an object where the provider serializes arguments as a
 * string.
 *
 * @see {@link ToolCallResponsePart} for the matching result.
 * @stability experimental
 * @category schemas
 */
export const ToolCallRequestPart = extensible({
  type: Schema.Literal("tool_call"),
  id: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.String,
  arguments: Schema.optional(Schema.NullOr(Schema.Json)),
});

/**
 * A requested tool call with unvalidated arguments.
 *
 * @see {@link ToolCallRequestPart} for the schema.
 * @stability experimental
 * @category models
 */
export type ToolCallRequestPart = Schema.Schema.Type<typeof ToolCallRequestPart>;

/**
 * Schema for the result of a tool call sent to a model.
 *
 * @see {@link ToolCallRequestPart} for the matching call.
 * @stability experimental
 * @category schemas
 */
export const ToolCallResponsePart = extensible({
  type: Schema.Literal("tool_call_response"),
  id: Schema.optional(Schema.NullOr(Schema.String)),
  response: Schema.Json,
});

/**
 * A tool call result with an unvalidated payload.
 *
 * @see {@link ToolCallResponsePart} for the schema.
 * @stability experimental
 * @category models
 */
export type ToolCallResponsePart = Schema.Schema.Type<typeof ToolCallResponsePart>;

/**
 * Schema for the provider-specific details of a server-side tool call.
 *
 * **Details**
 *
 * The registry models the details as an open object discriminated by `type`.
 *
 * @see {@link ServerToolCallPart} for the enclosing call.
 * @stability experimental
 * @category schemas
 */
export const ServerToolCall = extensible({
  type: Schema.String,
});

/**
 * Provider-specific server-side tool call details.
 *
 * @see {@link ServerToolCall} for the schema.
 * @stability experimental
 * @category models
 */
export type ServerToolCall = Schema.Schema.Type<typeof ServerToolCall>;

/**
 * Schema for a tool call the model provider executed on its side.
 *
 * @see {@link ServerToolCallResponsePart} for the matching result.
 * @stability experimental
 * @category schemas
 */
export const ServerToolCallPart = extensible({
  type: Schema.Literal("server_tool_call"),
  id: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.String,
  server_tool_call: ServerToolCall,
});

/**
 * A server-side tool call with provider-specific details.
 *
 * @see {@link ServerToolCallPart} for the schema.
 * @stability experimental
 * @category models
 */
export type ServerToolCallPart = Schema.Schema.Type<typeof ServerToolCallPart>;

/**
 * Schema for the provider-specific details of a server-side tool result.
 *
 * **Details**
 *
 * The registry models the details as an open object discriminated by `type`.
 *
 * @see {@link ServerToolCallResponsePart} for the enclosing result.
 * @stability experimental
 * @category schemas
 */
export const ServerToolCallResponse = extensible({
  type: Schema.String,
});

/**
 * Provider-specific server-side tool result details.
 *
 * @see {@link ServerToolCallResponse} for the schema.
 * @stability experimental
 * @category models
 */
export type ServerToolCallResponse = Schema.Schema.Type<typeof ServerToolCallResponse>;

/**
 * Schema for the result of a tool call the model provider executed on its side.
 *
 * @see {@link ServerToolCallPart} for the matching call.
 * @stability experimental
 * @category schemas
 */
export const ServerToolCallResponsePart = extensible({
  type: Schema.Literal("server_tool_call_response"),
  id: Schema.optional(Schema.NullOr(Schema.String)),
  server_tool_call_response: ServerToolCallResponse,
});

/**
 * A server-side tool result with provider-specific details.
 *
 * @see {@link ServerToolCallResponsePart} for the schema.
 * @stability experimental
 * @category models
 */
export type ServerToolCallResponsePart = Schema.Schema.Type<typeof ServerToolCallResponsePart>;

/**
 * Schema for inline binary data sent to a model.
 *
 * **Gotchas**
 *
 * `content` is a base64 string on the wire, not the bytes themselves.
 *
 * @stability experimental
 * @category schemas
 */
export const BlobPart = extensible({
  type: Schema.Literal("blob"),
  mime_type: Schema.optional(Schema.NullOr(Schema.String)),
  modality: Modality,
  content: Schema.String,
});

/**
 * Inline binary data within a message.
 *
 * @see {@link BlobPart} for the schema and encoding.
 * @stability experimental
 * @category models
 */
export type BlobPart = Schema.Schema.Type<typeof BlobPart>;

/**
 * Schema for a file sent to a model by the identifier it was uploaded under.
 *
 * @see {@link UriPart} for a file referenced by URI.
 * @stability experimental
 * @category schemas
 */
export const FilePart = extensible({
  type: Schema.Literal("file"),
  mime_type: Schema.optional(Schema.NullOr(Schema.String)),
  modality: Modality,
  file_id: Schema.String,
});

/**
 * A file reference by provider-assigned identifier.
 *
 * @see {@link FilePart} for the schema.
 * @stability experimental
 * @category models
 */
export type FilePart = Schema.Schema.Type<typeof FilePart>;

/**
 * Schema for a file sent to a model by URI.
 *
 * **Gotchas**
 *
 * Verification does not read the URI.
 * A base64 data URL is stated as a {@link BlobPart} instead.
 *
 * @see {@link FilePart} for a file referenced by identifier.
 * @stability experimental
 * @category schemas
 */
export const UriPart = extensible({
  type: Schema.Literal("uri"),
  mime_type: Schema.optional(Schema.NullOr(Schema.String)),
  modality: Modality,
  uri: Schema.String,
});

/**
 * A file reference by URI.
 *
 * @see {@link UriPart} for the schema.
 * @stability experimental
 * @category models
 */
export type UriPart = Schema.Schema.Type<typeof UriPart>;

/**
 * Schema for reasoning content received from a model.
 *
 * @stability experimental
 * @category schemas
 */
export const ReasoningPart = extensible({
  type: Schema.Literal("reasoning"),
  content: Schema.String,
});

/**
 * Reasoning content within a message.
 *
 * @see {@link ReasoningPart} for the schema.
 * @stability experimental
 * @category models
 */
export type ReasoningPart = Schema.Schema.Type<typeof ReasoningPart>;

/**
 * Schema for compacted conversation state.
 *
 * @stability experimental
 * @category schemas
 */
export const CompactionPart = extensible({
  type: Schema.Literal("compaction"),
  id: Schema.optional(Schema.NullOr(Schema.String)),
  content: Schema.optional(Schema.NullOr(Schema.String)),
});

/**
 * Compacted conversation state within a message.
 *
 * @see {@link CompactionPart} for the schema.
 * @stability experimental
 * @category models
 */
export type CompactionPart = Schema.Schema.Type<typeof CompactionPart>;

/**
 * Schema for a message part the registry does not model.
 *
 * **Details**
 *
 * Any properties beyond `type` are preserved.
 * This member closes {@link Part}, so a provider-specific part is read as a
 * generic one.
 *
 * @stability experimental
 * @category schemas
 */
export const GenericPart = extensible({
  type: Schema.String,
});

/**
 * A message part with a provider-specific type.
 *
 * @see {@link GenericPart} for the schema.
 * @stability experimental
 * @category models
 */
export type GenericPart = Schema.Schema.Type<typeof GenericPart>;

/**
 * Schema for one part of a message.
 *
 * **Details**
 *
 * The union covers the part types the registry defines, followed by
 * {@link GenericPart} for any other.
 *
 * **Gotchas**
 *
 * A defined part with a missing required field can be read as a
 * {@link GenericPart}, as the registry's JSON schemas read one.
 *
 * @stability experimental
 * @category schemas
 */
export const Part = Schema.Union([
  TextPart,
  ToolCallRequestPart,
  ToolCallResponsePart,
  ServerToolCallPart,
  ServerToolCallResponsePart,
  BlobPart,
  FilePart,
  UriPart,
  ReasoningPart,
  CompactionPart,
  GenericPart,
]);

/**
 * One part of a message.
 *
 * @see {@link Part} for the schema and decoding limits.
 * @stability experimental
 * @category models
 */
export type Part = Schema.Schema.Type<typeof Part>;

const chatMessage = {
  role: Role,
  parts: Schema.Array(Part),
  name: Schema.optional(Schema.NullOr(Schema.String)),
};

/**
 * Schema for one message of a conversation.
 *
 * @see {@link InputMessages} for the messages sent to a model.
 * @see {@link OutputMessage} for a message a model generated.
 * @stability experimental
 * @category schemas
 */
export const ChatMessage = extensible(chatMessage);

/**
 * One message of a conversation.
 *
 * @see {@link ChatMessage} for the schema.
 * @stability experimental
 * @category models
 */
export type ChatMessage = Schema.Schema.Type<typeof ChatMessage>;

/**
 * Schema for one message a model generated.
 *
 * **Details**
 *
 * Each message is one choice or candidate.
 *
 * **Gotchas**
 *
 * `finish_reason` is deprecated.
 * Report the reason in `gen_ai.response.finish_reasons` instead.
 *
 * @see {@link OutputMessages} for the messages a model generated.
 * @stability experimental
 * @category schemas
 */
export const OutputMessage = extensible({
  ...chatMessage,
  finish_reason: Schema.optional(Schema.NullOr(FinishReason)),
});

/**
 * One message generated by a model.
 *
 * @see {@link OutputMessage} for the schema.
 * @stability experimental
 * @category models
 */
export type OutputMessage = Schema.Schema.Type<typeof OutputMessage>;

/**
 * Schema for the conversation sent to a model.
 *
 * @see {@link OutputMessages} for the conversation a model generated.
 * @stability experimental
 * @category schemas
 */
export const InputMessages = Schema.Array(ChatMessage);

/**
 * The conversation sent to a model, in the order it was sent.
 *
 * @see {@link InputMessages} for the schema.
 * @stability experimental
 * @category models
 */
export type InputMessages = Schema.Schema.Type<typeof InputMessages>;

/**
 * Schema for the messages a model generated.
 *
 * **Details**
 *
 * The order matches the corresponding entries of
 * `gen_ai.response.finish_reasons`.
 *
 * @see {@link InputMessages} for the conversation sent to a model.
 * @stability experimental
 * @category schemas
 */
export const OutputMessages = Schema.Array(OutputMessage);

/**
 * The messages a model generated, one per choice or candidate.
 *
 * @see {@link OutputMessages} for the schema.
 * @stability experimental
 * @category models
 */
export type OutputMessages = Schema.Schema.Type<typeof OutputMessages>;

/**
 * Schema for one part of a system instruction.
 *
 * **Details**
 *
 * Instructions are text, or a provider-specific part read as
 * {@link GenericPart}.
 *
 * @see {@link SystemInstructions} for the instruction list.
 * @stability experimental
 * @category schemas
 */
export const SystemInstructionPart = Schema.Union([TextPart, GenericPart]);

/**
 * One part of a system instruction.
 *
 * @see {@link SystemInstructionPart} for the schema.
 * @stability experimental
 * @category models
 */
export type SystemInstructionPart = Schema.Schema.Type<typeof SystemInstructionPart>;

/**
 * Schema for the instructions given to a model apart from the conversation.
 *
 * @see {@link InputMessages} for the conversation itself.
 * @stability experimental
 * @category schemas
 */
export const SystemInstructions = Schema.Array(SystemInstructionPart);

/**
 * The instructions given to a model apart from the conversation.
 *
 * @see {@link SystemInstructions} for the schema.
 * @stability experimental
 * @category models
 */
export type SystemInstructions = Schema.Schema.Type<typeof SystemInstructions>;

/**
 * Schema for a function tool offered to a model.
 *
 * **Gotchas**
 *
 * `parameters` is not compiled or checked as JSON Schema draft-07 here.
 *
 * @see {@link ToolDefinitions} for the offered tools.
 * @stability experimental
 * @category schemas
 */
export const FunctionToolDefinition = extensible({
  type: Schema.Literal("function"),
  name: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  parameters: Schema.optional(Schema.NullOr(Schema.JsonObject)),
});

/**
 * A function tool definition.
 *
 * @see {@link FunctionToolDefinition} for the schema.
 * @stability experimental
 * @category models
 */
export type FunctionToolDefinition = Schema.Schema.Type<typeof FunctionToolDefinition>;

/**
 * Schema for a tool definition the registry does not model.
 *
 * **Details**
 *
 * Any properties beyond `type` and `name` are preserved.
 *
 * @see {@link ToolDefinitions} for the offered tools.
 * @stability experimental
 * @category schemas
 */
export const GenericToolDefinition = extensible({
  type: Schema.String,
  name: Schema.String,
});

/**
 * A tool definition with a provider-specific type.
 *
 * @see {@link GenericToolDefinition} for the schema.
 * @stability experimental
 * @category models
 */
export type GenericToolDefinition = Schema.Schema.Type<typeof GenericToolDefinition>;

/**
 * Schema for one tool offered to a model.
 *
 * @see {@link ToolDefinitions} for the offered tools.
 * @stability experimental
 * @category schemas
 */
export const ToolDefinition = Schema.Union([FunctionToolDefinition, GenericToolDefinition]);

/**
 * One tool offered to a model.
 *
 * @see {@link ToolDefinition} for the schema.
 * @stability experimental
 * @category models
 */
export type ToolDefinition = Schema.Schema.Type<typeof ToolDefinition>;

/**
 * Schema for the tools offered to a model.
 *
 * @see {@link ToolDefinition} for one tool.
 * @stability experimental
 * @category schemas
 */
export const ToolDefinitions = Schema.Array(ToolDefinition);

/**
 * The tools offered to a model.
 *
 * @see {@link ToolDefinitions} for the schema.
 * @stability experimental
 * @category models
 */
export type ToolDefinitions = Schema.Schema.Type<typeof ToolDefinitions>;

/**
 * Schema for arguments passed to a tool call.
 *
 * @see {@link ToolCallResult} for the returned value.
 * @stability experimental
 * @category schemas
 */
export const ToolCallArguments = Schema.JsonObject;

/**
 * Object-like arguments passed to a tool call.
 *
 * @see {@link ToolCallArguments} for the schema.
 * @stability experimental
 * @category models
 */
export type ToolCallArguments = Schema.Schema.Type<typeof ToolCallArguments>;

/**
 * Schema for the value returned by a tool call.
 *
 * @see {@link ToolCallArguments} for the call arguments.
 * @stability experimental
 * @category schemas
 */
export const ToolCallResult = Schema.JsonObject;

/**
 * Object-like result returned by a tool call.
 *
 * @see {@link ToolCallResult} for the schema.
 * @stability experimental
 * @category models
 */
export type ToolCallResult = Schema.Schema.Type<typeof ToolCallResult>;

/**
 * Schema for one document returned by a retrieval operation.
 *
 * **Details**
 *
 * `id` identifies the document and `score` is its relevance.
 * Further fields, such as content or metadata, are preserved.
 *
 * @see {@link RetrievalDocuments} for the returned documents.
 * @stability experimental
 * @category schemas
 */
export const RetrievalDocument = extensible({
  id: Schema.optional(Schema.NullOr(Schema.String)),
  score: Schema.optional(Schema.NullOr(Schema.Number)),
});

/**
 * One retrieved document.
 *
 * @see {@link RetrievalDocument} for the schema.
 * @stability experimental
 * @category models
 */
export type RetrievalDocument = Schema.Schema.Type<typeof RetrievalDocument>;

/**
 * Schema for the documents returned by a retrieval operation.
 *
 * @stability experimental
 * @category schemas
 */
export const RetrievalDocuments = Schema.Array(RetrievalDocument);

/**
 * The documents returned by a retrieval operation.
 *
 * @see {@link RetrievalDocuments} for the schema.
 * @stability experimental
 * @category models
 */
export type RetrievalDocuments = Schema.Schema.Type<typeof RetrievalDocuments>;

/**
 * Schema for one record of a memory operation.
 *
 * **Details**
 *
 * `content` is required and holds whatever the store keeps.
 * `metadata` is provider-specific.
 *
 * @see {@link MemoryRecords} for the records of an operation.
 * @stability experimental
 * @category schemas
 */
export const MemoryRecord = extensible({
  content: Schema.Json,
  id: Schema.optional(Schema.NullOr(Schema.String)),
  metadata: Schema.optional(Schema.NullOr(Schema.JsonObject)),
  score: Schema.optional(Schema.NullOr(Schema.Number)),
});

/**
 * One stored or retrieved memory record.
 *
 * @see {@link MemoryRecord} for the schema.
 * @stability experimental
 * @category models
 */
export type MemoryRecord = Schema.Schema.Type<typeof MemoryRecord>;

/**
 * Schema for the records of a memory operation.
 *
 * @stability experimental
 * @category schemas
 */
export const MemoryRecords = Schema.Array(MemoryRecord);

/**
 * The records stored or retrieved by a memory operation.
 *
 * @see {@link MemoryRecords} for the schema.
 * @stability experimental
 * @category models
 */
export type MemoryRecords = Schema.Schema.Type<typeof MemoryRecords>;
