/**
 * ATIF — the Agent Trajectory Interchange Format — as this module states it.
 *
 * The format stated here is ATIF RFC 0001 at v1.8, kept at
 * `references/harbor/rfcs/0001-trajectory-format.md`. Every schema below names the
 * section of it that states the type, quoting the section's heading as the RFC
 * writes it.
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
 * The version of ATIF a document conforms to.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata", the `schema_version` of a
 * document.
 *
 * @category schemas
 */
export const SchemaVersion = Schema.Literals(versions);

/**
 * A {@link SchemaVersion} as it is read.
 *
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
 * The JSON a producer states beyond the format.
 *
 * ATIF RFC 0001 v1.8, Section II: the `arguments` of "ToolCallSchema" and the
 * `extra` field of every other type it states.
 *
 * @category schemas
 */
export const ProducerFields = Schema.Record(Schema.String, Schema.Unknown);

/**
 * The JSON a producer states beyond the format, as it is read.
 *
 * @category models
 */
export type ProducerFields = Schema.Schema.Type<typeof ProducerFields>;

/**
 * Where the bytes of an image are, and their type (v1.6+).
 *
 * ATIF RFC 0001 v1.8, Section II "ImageSourceSchema (v1.6+)".
 *
 * @category schemas
 */
export const ImageSource = Schema.Struct({
  /** One of the four types ATIF states for an image. */
  media_type: Schema.Literals(imageMediaTypes),
  /** A path relative to the document, an absolute path, or a URL. */
  path: Schema.String,
});

/**
 * An {@link ImageSource} as it is read.
 *
 * @category models
 */
export type ImageSource = Schema.Schema.Type<typeof ImageSource>;

/**
 * Where the bytes of a recording are, their type, and its length (v1.8+).
 *
 * ATIF RFC 0001 v1.8, Section II "AudioSourceSchema (v1.8+)".
 *
 * @category schemas
 */
export const AudioSource = Schema.Struct({
  /** A type ATIF states for audio, or a spelling it tells a consumer to accept. */
  media_type: Schema.Literals([...audioMediaTypes, ...audioMediaTypeSpellings]),
  /** A path relative to the document, an absolute path, or a URL. */
  path: Schema.String,
  /** How long the recording is in seconds, where the producer knew it. */
  duration_sec: Schema.optional(Schema.NullOr(Schema.Number)),
});

/**
 * An {@link AudioSource} as it is read.
 *
 * @category models
 */
export type AudioSource = Schema.Schema.Type<typeof AudioSource>;

/**
 * The text of a message or of a result (v1.6+).
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * @category schemas
 */
export const TextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
  /** Must be omitted. */
  source: omitted,
});

/**
 * A {@link TextPart} as it is read.
 *
 * @category models
 */
export type TextPart = Schema.Schema.Type<typeof TextPart>;

/**
 * An image a message or a result states, by the location of its bytes (v1.6+).
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * @category schemas
 */
export const ImagePart = Schema.Struct({
  type: Schema.Literal("image"),
  source: ImageSource,
  /** Must be omitted. */
  text: omitted,
});

/**
 * An {@link ImagePart} as it is read.
 *
 * @category models
 */
export type ImagePart = Schema.Schema.Type<typeof ImagePart>;

/**
 * A recording of speech a message or a result states, by the location of its bytes
 * (v1.8+).
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * @category schemas
 */
export const AudioPart = Schema.Struct({
  type: Schema.Literal("audio"),
  source: AudioSource,
  /** Must be omitted. */
  text: omitted,
});

/**
 * An {@link AudioPart} as it is read.
 *
 * @category models
 */
export type AudioPart = Schema.Schema.Type<typeof AudioPart>;

/**
 * A part of a message that is not text: an image (v1.6+), or a recording (v1.8+).
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * @category schemas
 */
export const MediaPart = Schema.Union([ImagePart, AudioPart]);

/**
 * A {@link MediaPart} as it is read.
 *
 * @category models
 */
export type MediaPart = Schema.Schema.Type<typeof MediaPart>;

/**
 * What a message says, or what a result answered with: the text itself, or the
 * parts it is stated as where it holds more than text (v1.6+).
 *
 * ATIF RFC 0001 v1.8, Section II: the `message` field of "StepObject", the
 * `content` field of "ObservationResultSchema", and "ContentPartSchema (v1.6+)".
 *
 * @category schemas
 */
export const Content = Schema.Union([
  Schema.String,
  Schema.Array(Schema.Union([TextPart, MediaPart])),
]);

/**
 * A {@link Content} as it is read.
 *
 * @category models
 */
export type Content = Schema.Schema.Type<typeof Content>;

/**
 * A call a step made of a tool.
 *
 * ATIF RFC 0001 v1.8, Section II "ToolCallSchema".
 *
 * @category models
 */
export const ToolCall = Schema.Struct({
  /** The identifier the result of this call answers it by. */
  tool_call_id: Schema.String,
  /** The name of the tool the step called. */
  function_name: Schema.String,
  /** The arguments the call was made with, as the JSON the model produced. */
  arguments: ProducerFields,
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link ToolCall} as it is read.
 *
 * @category models
 */
export type ToolCall = Schema.Schema.Type<typeof ToolCall>;

/**
 * A reference to a trajectory of delegated work (v1.7+).
 *
 * ATIF RFC 0001 v1.8, Section II "SubagentTrajectoryRefSchema".
 *
 * A reference names at least one of `trajectory_id` and `trajectory_path`.
 *
 * @category models
 */
export const SubagentTrajectoryRef = Schema.Struct({
  /** The `trajectory_id` of a document embedded in `subagent_trajectories`. */
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** The path of the trajectory file beside the document. */
  trajectory_path: Schema.optional(Schema.NullOr(Schema.String)),
  /** The run the subagent belonged to; informational only. */
  session_id: Schema.optional(Schema.NullOr(Schema.String)),
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link SubagentTrajectoryRef} as it is read.
 *
 * @category models
 */
export type SubagentTrajectoryRef = Schema.Schema.Type<typeof SubagentTrajectoryRef>;

/**
 * One result a step was answered with.
 *
 * ATIF RFC 0001 v1.8, Section II "ObservationResultSchema".
 *
 * @category models
 */
export const ObservationResult = Schema.Struct({
  /** The `tool_call_id` of the call this result answers, where one is named. */
  source_call_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** What the call or action answered with. */
  content: Schema.optional(Content),
  /** The trajectories a delegated call left. */
  subagent_trajectory_ref: Schema.Array(SubagentTrajectoryRef).pipe(Schema.NullOr, Schema.optional),
  extra: Schema.optional(ProducerFields),
});

/**
 * An {@link ObservationResult} as it is read.
 *
 * @category models
 */
export type ObservationResult = Schema.Schema.Type<typeof ObservationResult>;

/**
 * What a step was answered with.
 *
 * ATIF RFC 0001 v1.8, Section II "ObservationSchema".
 *
 * @category models
 */
export const Observation = Schema.Struct({
  /** One result per call or action. */
  results: Schema.Array(ObservationResult),
});

/**
 * An {@link Observation} as it is read.
 *
 * @category models
 */
export type Observation = Schema.Schema.Type<typeof Observation>;

/**
 * The tokens, the cost and the confidence data of one agent step.
 *
 * ATIF RFC 0001 v1.8, Section II "MetricsSchema".
 *
 * @category models
 */
export const Metrics = Schema.Struct({
  /** Every input token the model processed, cached and not. */
  prompt_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** Every token the model generated. */
  completion_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** The subset of `prompt_tokens` read from a prompt cache. */
  cached_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** What the call cost, as the producer read it. */
  cost_usd: Schema.optional(Schema.NullOr(Schema.Number)),
  prompt_token_ids: Schema.Array(Schema.Int).pipe(Schema.NullOr, Schema.optional),
  completion_token_ids: Schema.Array(Schema.Int).pipe(Schema.NullOr, Schema.optional),
  logprobs: Schema.Array(Schema.Number).pipe(Schema.NullOr, Schema.optional),
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link Metrics} as it is read.
 *
 * @category models
 */
export type Metrics = Schema.Schema.Type<typeof Metrics>;

/**
 * The tokens and the cost of a run as a whole.
 *
 * ATIF RFC 0001 v1.8, Section II "FinalMetricsSchema".
 *
 * @category models
 */
export const FinalMetrics = Schema.Struct({
  /** Every input token of the run, cached and not. */
  total_prompt_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** Every token the run generated. */
  total_completion_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** The input tokens of the run read from a prompt cache. */
  total_cached_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** What the whole run cost, as the producer read it. */
  total_cost_usd: Schema.optional(Schema.NullOr(Schema.Number)),
  /** The producer's own count of the steps of the run. */
  total_steps: Schema.optional(Schema.NullOr(Schema.Int)),
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link FinalMetrics} as it is read.
 *
 * @category models
 */
export type FinalMetrics = Schema.Schema.Type<typeof FinalMetrics>;

/**
 * One tool an agent was given, in the shape OpenAI states a function in.
 *
 * ATIF RFC 0001 v1.8, Section II "AgentSchema", the `tool_definitions` an agent was
 * given.
 *
 * @category models
 */
export const ToolDefinition = Schema.Struct({
  /** The kind of tool: `"function"` for the tools ATIF states. */
  type: Schema.String,
  function: Schema.Struct({
    /** The name the tool is called by. */
    name: Schema.String,
    /** What the tool does, as the model was told. */
    description: Schema.optional(Schema.NullOr(Schema.String)),
    /** The JSON schema of the arguments the tool accepts. */
    parameters: Schema.optional(Schema.JsonObject),
    /** Whether the arguments must follow the schema exactly. */
    strict: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link ToolDefinition} as it is read.
 *
 * @category models
 */
export type ToolDefinition = Schema.Schema.Type<typeof ToolDefinition>;

/**
 * The agent that ran, as the document states it.
 *
 * ATIF RFC 0001 v1.8, Section II "AgentSchema".
 *
 * @category models
 */
export const Agent = Schema.Struct({
  /** The name of the agent system, such as `claude-code`. */
  name: Schema.String,
  /** The version of the agent system. */
  version: Schema.String,
  /** The model the agent ran on by default, which a step overrides. */
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  /** The tools the agent was given (v1.5+). */
  tool_definitions: Schema.Array(ToolDefinition).pipe(Schema.NullOr, Schema.optional),
  extra: Schema.optional(ProducerFields),
});

/**
 * An {@link Agent} as it is read.
 *
 * @category models
 */
export type Agent = Schema.Schema.Type<typeof Agent>;

/**
 * One step of a document: a system prompt, a user message, or a complete agent turn.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject".
 *
 * `reasoning_content`, `reasoning_effort`, `tool_calls` and `metrics` apply to agent
 * steps alone.
 *
 * @category models
 */
export const StepObject = Schema.Struct({
  /** The ordinal of the step, numbered from `1`. */
  step_id: Schema.Int,
  timestamp: Schema.optional(Schema.NullOr(Schema.String)),
  /** Who contributed the step: the system, the user, or the agent. */
  source: Schema.Literals(sources),
  /** The model that answered the step. */
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  /** A qualitative name, or a numeric score. */
  reasoning_effort: Schema.Union([Schema.String, Schema.Number]).pipe(
    Schema.NullOr,
    Schema.optional,
  ),
  /** What the step said. */
  message: Content,
  /** What the agent thought. */
  reasoning_content: Schema.optional(Schema.NullOr(Schema.String)),
  /** The tools the step called. */
  tool_calls: Schema.Array(ToolCall).pipe(Schema.NullOr, Schema.optional),
  /** What the step was answered with. */
  observation: Schema.optional(Schema.NullOr(Observation)),
  /** The tokens, the cost and the confidence data of the step. */
  metrics: Schema.optional(Schema.NullOr(Metrics)),
  /** Whether the step was copied from a prior trajectory for context. */
  is_copied_context: Schema.optional(Schema.NullOr(Schema.Boolean)),
  /** How many LLM inferences the step represents; `0` for a deterministic dispatch. */
  llm_call_count: Schema.optional(Schema.NullOr(Schema.Int)),
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link StepObject} as it is read.
 *
 * @category models
 */
export type StepObject = Schema.Schema.Type<typeof StepObject>;

/**
 * An ATIF document: one run of an agent, as the format carries it.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata".
 *
 * @category schemas
 */
export const Document: Schema.Codec<Document> = Schema.Struct({
  schema_version: SchemaVersion,
  /** The run the document belongs to; run-scoped, and optional since v1.7. */
  session_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** The identity of the document among the ones of its run (v1.7+). */
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  agent: Agent,
  /** The steps of the run, numbered from `1`. */
  steps: Schema.NonEmptyArray(StepObject),
  /** What the producer wrote of the run itself. */
  notes: Schema.optional(Schema.NullOr(Schema.String)),
  final_metrics: Schema.optional(Schema.NullOr(FinalMetrics)),
  /** The document this one is continued in. */
  continued_trajectory_ref: Schema.optional(Schema.NullOr(Schema.String)),
  extra: Schema.optional(ProducerFields),
  /** The trajectories of the subagents a step delegated work to (v1.7+). */
  subagent_trajectories: Schema.suspend(() => Document).pipe(Schema.Array, Schema.optional),
});

/**
 * A {@link Document} as it is read.
 *
 * @category models
 */
export interface Document {
  readonly schema_version: (typeof versions)[number];
  /** The run the document belongs to; run-scoped, and optional since v1.7. */
  readonly session_id?: string | null | undefined;
  /** The identity of the document among the ones of its run (v1.7+). */
  readonly trajectory_id?: string | null | undefined;
  readonly agent: Agent;
  /** The steps of the run, numbered from `1`. */
  readonly steps: readonly [StepObject, ...Array<StepObject>];
  /** What the producer wrote of the run itself. */
  readonly notes?: string | null | undefined;
  readonly final_metrics?: FinalMetrics | null | undefined;
  /** The document this one is continued in. */
  readonly continued_trajectory_ref?: string | null | undefined;
  readonly extra?: ProducerFields | undefined;
  /** The trajectories of the subagents a step delegated work to (v1.7+). */
  readonly subagent_trajectories?: ReadonlyArray<Document> | undefined;
}

/**
 * The document as the JSON a `trajectory.json` holds.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata".
 *
 * @category schemas
 */
export const FromJson = Schema.fromJsonString(Document);
