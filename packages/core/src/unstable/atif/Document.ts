/**
 * Schemas for the Agent Trajectory Interchange Format through ATIF v1.8.
 *
 * {@link Document} reads structured values and {@link FromJson} reads JSON text.
 * The format reference is `references/harbor/rfcs/0001-trajectory-format.md`, RFC 0001 v1.8.
 *
 * @stability stable
 */

import { Schema } from "effect";

const versions = [
  "ATIF-v1.0",
  "ATIF-v1.1",
  "ATIF-v1.2",
  "ATIF-v1.3",
  "ATIF-v1.4",
  "ATIF-v1.5",
  "ATIF-v1.6",
  "ATIF-v1.7",
  "ATIF-v1.8",
] as const;

const sources = ["system", "user", "agent"] as const;

/**
 * Schema for supported ATIF version labels from `ATIF-v1.0` through `ATIF-v1.8`.
 *
 * **Gotchas**
 *
 * The label does not select a separate validation schema for each version.
 *
 * @see {@link Document} for root-level validation.
 * @stability stable
 * @category schemas
 */
export const SchemaVersion = Schema.Literals(versions);

/**
 * A supported ATIF version label.
 *
 * @see {@link SchemaVersion} for the schema.
 * @stability stable
 * @category models
 */
export type SchemaVersion = Schema.Schema.Type<typeof SchemaVersion>;

/** The types ATIF states for an image. */
const imageMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

/** The types ATIF states for audio, as it writes them. */
const audioMediaTypes = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
  "audio/aiff",
] as const;

/** The spellings ATIF tells a consumer to accept beside the types it states. */
const audioMediaTypeSpellings = [
  "audio/mp3",
  "audio/mpga",
  "audio/x-mpeg",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/x-m4a",
  "audio/m4a",
  "audio/x-aac",
  "audio/x-flac",
  "audio/x-aiff",
] as const;

/**
 * A field ATIF states for one kind of part alone.
 *
 * Declared on the kinds that must omit it, so a document that writes one is
 * rejected rather than read with the field dropped.
 */
const omitted = Schema.optional(Schema.Never);

/**
 * Schema for producer-defined fields and tool arguments.
 *
 * **Gotchas**
 *
 * Values are unknown, not restricted to JSON-compatible values by this schema.
 *
 * @stability stable
 * @category schemas
 */
export const ProducerFields = Schema.Record(Schema.String, Schema.Unknown);

/**
 * Producer-defined fields without payload validation.
 *
 * @see {@link ProducerFields} for the schema.
 * @stability stable
 * @category models
 */
export type ProducerFields = Schema.Schema.Type<typeof ProducerFields>;

/**
 * Schema for an image location and media type, introduced in ATIF v1.6.
 *
 * **Details**
 *
 * `path` can describe a relative path, an absolute path, or a URL.
 * Validation does not read or resolve the location.
 *
 * @see {@link ImagePart} for embedding the source in content.
 * @stability stable
 * @category schemas
 */
export const ImageSource = Schema.Struct({
  media_type: Schema.Literals(imageMediaTypes),
  path: Schema.String,
});

/**
 * An image location without embedded bytes.
 *
 * @see {@link ImageSource} for the schema.
 * @stability stable
 * @category models
 */
export type ImageSource = Schema.Schema.Type<typeof ImageSource>;

/**
 * Schema for an audio location, media type, and optional duration, introduced in ATIF v1.8.
 *
 * **Details**
 *
 * Media types include ATIF's accepted alternative spellings.
 * `duration_sec` measures seconds and can be omitted or `null`.
 * Validation does not read or resolve the location.
 *
 * @see {@link AudioPart} for embedding the source in content.
 * @stability stable
 * @category schemas
 */
export const AudioSource = Schema.Struct({
  media_type: Schema.Literals([...audioMediaTypes, ...audioMediaTypeSpellings]),
  path: Schema.String,
  duration_sec: Schema.optional(Schema.NullOr(Schema.Number)),
});

/**
 * An audio location with optional duration in seconds.
 *
 * @see {@link AudioSource} for the schema.
 * @stability stable
 * @category models
 */
export type AudioSource = Schema.Schema.Type<typeof AudioSource>;

/**
 * Schema for a text content part, introduced in ATIF v1.6.
 *
 * **Gotchas**
 *
 * A `source` field is rejected, not silently discarded.
 *
 * @see {@link Content} for messages and observation content.
 * @stability stable
 * @category schemas
 */
export const TextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
  source: omitted,
});

/**
 * Text within an ATIF content array.
 *
 * @see {@link TextPart} for the schema.
 * @stability stable
 * @category models
 */
export type TextPart = Schema.Schema.Type<typeof TextPart>;

/**
 * Schema for image content referencing an {@link ImageSource}, introduced in ATIF v1.6.
 *
 * **Gotchas**
 *
 * A `text` field is rejected, not silently discarded.
 *
 * @see {@link Content} for messages and observation content.
 * @stability stable
 * @category schemas
 */
export const ImagePart = Schema.Struct({
  type: Schema.Literal("image"),
  source: ImageSource,
  text: omitted,
});

/**
 * Image content referencing bytes outside the document.
 *
 * @see {@link ImagePart} for the schema.
 * @stability stable
 * @category models
 */
export type ImagePart = Schema.Schema.Type<typeof ImagePart>;

/**
 * Schema for audio content referencing an {@link AudioSource}, introduced in ATIF v1.8.
 *
 * **Gotchas**
 *
 * A `text` field is rejected, not silently discarded.
 *
 * @see {@link Content} for messages and observation content.
 * @stability stable
 * @category schemas
 */
export const AudioPart = Schema.Struct({
  type: Schema.Literal("audio"),
  source: AudioSource,
  text: omitted,
});

/**
 * Audio content referencing bytes outside the document.
 *
 * @see {@link AudioPart} for the schema.
 * @stability stable
 * @category models
 */
export type AudioPart = Schema.Schema.Type<typeof AudioPart>;

/**
 * Schema for image or audio content without text.
 *
 * @see {@link ImagePart} for image content.
 * @see {@link AudioPart} for audio content.
 * @stability stable
 * @category schemas
 */
export const MediaPart = Schema.Union([ImagePart, AudioPart]);

/**
 * An image or audio reference within ATIF content.
 *
 * @see {@link MediaPart} for the schema.
 * @stability stable
 * @category models
 */
export type MediaPart = Schema.Schema.Type<typeof MediaPart>;

/**
 * Schema for message and observation content as text or an ordered content array.
 *
 * **Details**
 *
 * Arrays can mix text, image, and audio parts.
 * Empty strings and empty arrays are accepted.
 *
 * @see {@link StepObject} for step messages.
 * @see {@link ObservationResult} for returned content.
 * @stability stable
 * @category schemas
 */
export const Content = Schema.Union([
  Schema.String,
  Schema.Array(Schema.Union([TextPart, MediaPart])),
]);

/**
 * Text or ordered multimodal content from a message or observation.
 *
 * @see {@link Content} for the schema.
 * @stability stable
 * @category models
 */
export type Content = Schema.Schema.Type<typeof Content>;

/**
 * Schema for a tool invocation recorded within a step.
 *
 * **Details**
 *
 * `tool_call_id` correlates the invocation with observation results.
 * Arguments are not validated against the agent's tool definitions.
 *
 * @see {@link ObservationResult} for returned content.
 * @stability stable
 * @category schemas
 */
export const ToolCall = Schema.Struct({
  tool_call_id: Schema.String,
  function_name: Schema.String,
  arguments: ProducerFields,
  extra: Schema.optional(ProducerFields),
});

/**
 * A recorded tool invocation with unvalidated arguments.
 *
 * @see {@link ToolCall} for the schema.
 * @stability stable
 * @category models
 */
export type ToolCall = Schema.Schema.Type<typeof ToolCall>;

/**
 * Schema for a delegated trajectory reference, introduced in ATIF v1.7.
 *
 * **Details**
 *
 * `trajectory_id` identifies an embedded document.
 * `trajectory_path` identifies a separate trajectory file.
 * `session_id` is informational.
 *
 * **Gotchas**
 *
 * ATIF requires an id or path, but this schema accepts both absent or `null`.
 * Reference resolution is not performed during validation.
 *
 * @stability stable
 * @category schemas
 */
export const SubagentTrajectoryRef = Schema.Struct({
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  trajectory_path: Schema.optional(Schema.NullOr(Schema.String)),
  session_id: Schema.optional(Schema.NullOr(Schema.String)),
  extra: Schema.optional(ProducerFields),
});

/**
 * An unresolved delegated trajectory reference.
 *
 * @see {@link SubagentTrajectoryRef} for the schema and validation limits.
 * @stability stable
 * @category models
 */
export type SubagentTrajectoryRef = Schema.Schema.Type<typeof SubagentTrajectoryRef>;

/**
 * Schema for one observation result and its optional delegated trajectories.
 *
 * **Details**
 *
 * `source_call_id` correlates the result with a tool invocation when present.
 * Content can be absent even when delegated trajectory references are present.
 *
 * @see {@link Observation} for the result collection.
 * @stability stable
 * @category schemas
 */
export const ObservationResult = Schema.Struct({
  source_call_id: Schema.optional(Schema.NullOr(Schema.String)),
  content: Schema.optional(Content),
  subagent_trajectory_ref: Schema.Array(SubagentTrajectoryRef).pipe(Schema.NullOr, Schema.optional),
  extra: Schema.optional(ProducerFields),
});

/**
 * One observation result, possibly without a corresponding tool call.
 *
 * @see {@link ObservationResult} for the schema.
 * @stability stable
 * @category models
 */
export type ObservationResult = Schema.Schema.Type<typeof ObservationResult>;

/**
 * Schema for the ordered observation results of a step.
 *
 * **Details**
 *
 * The result array can be empty.
 *
 * @see {@link ObservationResult} for individual results.
 * @stability stable
 * @category schemas
 */
export const Observation = Schema.Struct({
  results: Schema.Array(ObservationResult),
});

/**
 * The ordered observation results attached to a step.
 *
 * @see {@link Observation} for the schema.
 * @stability stable
 * @category models
 */
export type Observation = Schema.Schema.Type<typeof Observation>;

/**
 * Schema for per-step token usage, cost, token ids, and log probabilities.
 *
 * **Details**
 *
 * `cached_tokens` is a subset of `prompt_tokens`, not an additional token count.
 * Cost uses US dollars.
 * Every standard field can be omitted or `null`.
 *
 * @see {@link FinalMetrics} for whole-run totals.
 * @stability stable
 * @category schemas
 */
export const Metrics = Schema.Struct({
  prompt_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  completion_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  cached_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  cost_usd: Schema.optional(Schema.NullOr(Schema.Number)),
  prompt_token_ids: Schema.Array(Schema.Int).pipe(Schema.NullOr, Schema.optional),
  completion_token_ids: Schema.Array(Schema.Int).pipe(Schema.NullOr, Schema.optional),
  logprobs: Schema.Array(Schema.Number).pipe(Schema.NullOr, Schema.optional),
  extra: Schema.optional(ProducerFields),
});

/**
 * Optional per-step usage and confidence data.
 *
 * @see {@link Metrics} for the schema and count semantics.
 * @stability stable
 * @category models
 */
export type Metrics = Schema.Schema.Type<typeof Metrics>;

/**
 * Schema for whole-run token, cost, and step totals.
 *
 * **Details**
 *
 * Cached tokens are included in prompt tokens.
 * Cost uses US dollars.
 * Totals are supplied by the producer, not calculated or cross-checked against steps.
 *
 * @see {@link Metrics} for per-step results.
 * @stability stable
 * @category schemas
 */
export const FinalMetrics = Schema.Struct({
  total_prompt_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  total_completion_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  total_cached_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  total_cost_usd: Schema.optional(Schema.NullOr(Schema.Number)),
  total_steps: Schema.optional(Schema.NullOr(Schema.Int)),
  extra: Schema.optional(ProducerFields),
});

/**
 * Producer-reported totals for a complete run.
 *
 * @see {@link FinalMetrics} for the schema.
 * @stability stable
 * @category models
 */
export type FinalMetrics = Schema.Schema.Type<typeof FinalMetrics>;

/**
 * Schema for an agent tool definition in OpenAI function format.
 *
 * **Gotchas**
 *
 * `type` accepts any string, not only `"function"`.
 * Parameter JSON is not compiled or used to validate recorded calls by this schema.
 *
 * @see {@link Agent} for the enclosing tool list.
 * @stability stable
 * @category schemas
 */
export const ToolDefinition = Schema.Struct({
  type: Schema.String,
  function: Schema.Struct({
    name: Schema.String,
    description: Schema.optional(Schema.NullOr(Schema.String)),
    parameters: Schema.optional(Schema.JsonObject),
    strict: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),
  extra: Schema.optional(ProducerFields),
});

/**
 * An agent tool description without an executable handler.
 *
 * @see {@link ToolDefinition} for the schema.
 * @stability stable
 * @category models
 */
export type ToolDefinition = Schema.Schema.Type<typeof ToolDefinition>;

/**
 * Schema for an agent's identity, default model, and available tools.
 *
 * **Details**
 *
 * A step's `model_name` can override the agent's default model.
 * Tool definitions were introduced in ATIF v1.5.
 *
 * @see {@link Document} for the enclosing run.
 * @stability stable
 * @category schemas
 */
export const Agent = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  tool_definitions: Schema.Array(ToolDefinition).pipe(Schema.NullOr, Schema.optional),
  extra: Schema.optional(ProducerFields),
});

/**
 * The recorded agent identity and its default execution settings.
 *
 * @see {@link Agent} for the schema.
 * @stability stable
 * @category models
 */
export type Agent = Schema.Schema.Type<typeof Agent>;

/**
 * Schema for a system step, user message, or agent turn.
 *
 * **Details**
 *
 * ATIF numbers `step_id` from one.
 * `llm_call_count: 0` represents deterministic dispatch without model inference.
 * `is_copied_context` marks context repeated from an earlier trajectory.
 *
 * **Gotchas**
 *
 * `message` is required even for system conventions without conversational text.
 * Validation does not enforce positive ids, consecutive numbering, timestamps, or source-specific fields.
 *
 * @see {@link Metrics} for usage data.
 * @see {@link Observation} for returned results.
 * @stability stable
 * @category schemas
 */
export const StepObject = Schema.Struct({
  step_id: Schema.Int,
  timestamp: Schema.optional(Schema.NullOr(Schema.String)),
  source: Schema.Literals(sources),
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  reasoning_effort: Schema.Union([Schema.String, Schema.Number]).pipe(
    Schema.NullOr,
    Schema.optional,
  ),
  message: Content,
  reasoning_content: Schema.optional(Schema.NullOr(Schema.String)),
  tool_calls: Schema.Array(ToolCall).pipe(Schema.NullOr, Schema.optional),
  observation: Schema.optional(Schema.NullOr(Observation)),
  metrics: Schema.optional(Schema.NullOr(Metrics)),
  is_copied_context: Schema.optional(Schema.NullOr(Schema.Boolean)),
  llm_call_count: Schema.optional(Schema.NullOr(Schema.Int)),
  extra: Schema.optional(ProducerFields),
});

/**
 * A recorded ATIF step before conversion into trajectory parts.
 *
 * @see {@link StepObject} for the schema and validation limits.
 * @stability stable
 * @category models
 */
export type StepObject = Schema.Schema.Type<typeof StepObject>;

/**
 * Schema for an ATIF document with at least one step.
 *
 * **Details**
 *
 * Embedded subagent documents use this schema recursively.
 * `session_id` identifies the run; `trajectory_id` identifies a document within that run.
 * Both identities can be omitted or `null`.
 * `continued_trajectory_ref` names the document continuing this run.
 *
 * **Gotchas**
 *
 * Cross-document references are not resolved or checked for consistency.
 * Validation does not enforce the rules of individual version labels.
 *
 * @see {@link FromJson} for JSON text.
 * @see {@link StepObject} for per-step validation limits.
 * @stability stable
 * @category schemas
 */
export const Document: Schema.Codec<Document> = Schema.Struct({
  schema_version: SchemaVersion,
  session_id: Schema.optional(Schema.NullOr(Schema.String)),
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  agent: Agent,
  steps: Schema.NonEmptyArray(StepObject),
  notes: Schema.optional(Schema.NullOr(Schema.String)),
  final_metrics: Schema.optional(Schema.NullOr(FinalMetrics)),
  continued_trajectory_ref: Schema.optional(Schema.NullOr(Schema.String)),
  extra: Schema.optional(ProducerFields),
  subagent_trajectories: Schema.suspend(() => Document).pipe(Schema.Array, Schema.optional),
});

/**
 * A structured ATIF run with recursive embedded subagent documents.
 *
 * @see {@link Document} for the schema.
 * @stability stable
 * @category models
 */
export interface Document {
  readonly schema_version: (typeof versions)[number];
  readonly session_id?: string | null | undefined;
  readonly trajectory_id?: string | null | undefined;
  readonly agent: Agent;
  readonly steps: readonly [StepObject, ...Array<StepObject>];
  readonly notes?: string | null | undefined;
  readonly final_metrics?: FinalMetrics | null | undefined;
  readonly continued_trajectory_ref?: string | null | undefined;
  readonly extra?: ProducerFields | undefined;
  readonly subagent_trajectories?: ReadonlyArray<Document> | undefined;
}

/**
 * Schema for decoding and encoding an ATIF document as JSON text.
 *
 * **Details**
 *
 * JSON parsing precedes {@link Document} validation during decoding.
 *
 * @see {@link Document} for structured values and validation limits.
 * @stability stable
 * @category schemas
 */
export const FromJson = Schema.fromJsonString(Document);
