/**
 * ATIF — the Agent Trajectory Interchange Format — as this package states it.
 *
 * ATIF carries an agent's run as one JSON document: the version of the format it
 * conforms to, the agent that ran, and the ordered steps of its conversation. This
 * module states that document in Effect Schema — {@link Document} and the schemas
 * it is made of — and {@link FromJson} reads the bytes of a `trajectory.json` as
 * the document they state.
 *
 * The schemas state the format rather than a program's reading of it: a step is a
 * {@link StepObject}, the results it was answered with are an {@link Observation},
 * and what a message says is {@link Content}, which states the text alone or the
 * parts a message holds where it holds more than text. A part that holds more than
 * text states where its bytes are rather than the bytes themselves — an
 * {@link ImageSource} for an image, an {@link AudioSource} for a recording.
 *
 * The format stated here is ATIF RFC 0001 at v1.8, kept at
 * `references/harbor/rfcs/0001-trajectory-format.md`, and every schema below names
 * the section of it that states the type, quoting the section's heading as the RFC
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
 * The version of ATIF a document conforms to, as the format states it.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata", the `schema_version` of a
 * document.
 *
 * **When to use**
 *
 * Use when reading what a document states of the format it is written in, or when
 * stating the version of a document of your own.
 *
 * **Details**
 *
 * The versions are the ones ATIF names, from `ATIF-v1.0` to `ATIF-v1.8`: a document
 * states the version it conforms to, and a reader that knows the format reads the
 * fields that version added. The set is what the RFC states, so a version beyond it
 * is rejected rather than read with the fields this package knows.
 *
 * @see {@link Document} for the document a version is stated by.
 * @category schemas
 */
export const SchemaVersion = Schema.Literals(versions);

/**
 * A {@link SchemaVersion} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata", the `schema_version` of a
 * document.
 *
 * @see {@link SchemaVersion} for the schema it is read by.
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

/**
 * What a producer writes for an audio type where a provider's API documents or
 * returns a spelling of its own, such as the `audio/mp3` of the Gemini API, which
 * ATIF tells a consumer to accept beside the type it states.
 */
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
 * A field ATIF states for one kind of part alone, declared on the kinds of part
 * that must omit it, so that a document which writes one is rejected as the format
 * says rather than read with the field dropped out of what it states.
 */
const omitted = Schema.optional(Schema.Never);

/**
 * What a producer states of a step, a result, a tool call, a metric or a document
 * beyond what the format states of it: the JSON a producer writes, which this
 * package carries as it was written rather than reading it.
 *
 * ATIF RFC 0001 v1.8, Section II: the `arguments` of "ToolCallSchema" and the
 * `extra` field of every other type it states.
 *
 * **When to use**
 *
 * Use to read the JSON a document states where the format leaves the field to the
 * producer, or to state JSON of your own.
 *
 * **Details**
 *
 * The fields are the producer's own: the format states that they are a JSON object
 * and leaves what it holds to whoever wrote it, so this package carries one as it
 * was written rather than reading it into terms of its own.
 *
 * @see {@link Document} for the document the fields of a producer belong to.
 * @category schemas
 */
export const ProducerFields = Schema.Record(Schema.String, Schema.Unknown);

/**
 * The JSON a producer states beyond what a format states, as it is read.
 *
 * @see {@link ProducerFields} for the schema it is read by.
 * @category models
 */
export type ProducerFields = Schema.Schema.Type<typeof ProducerFields>;

/**
 * Where the bytes of an image a part states are: the type of the image, and the
 * path or the URL they are at (v1.6+).
 *
 * ATIF RFC 0001 v1.8, Section II "ImageSourceSchema (v1.6+)".
 *
 * **When to use**
 *
 * Use when reading where the image of an {@link ImagePart} is, or when stating
 * one — an image is referenced by a location rather than carried by its bytes.
 *
 * **Details**
 *
 * `media_type` is what the image is, which ATIF states as one of `image/jpeg`,
 * `image/png`, `image/gif` or `image/webp`, and `path` is where its bytes are: a
 * file path relative to the document, an absolute path, or a URL. Images are
 * written beside the trajectory file by convention — the `images/` of the
 * directory a `trajectory.json` sits in — which the format leaves to the producer
 * rather than stating.
 *
 * @see {@link ImagePart} for the part that states where an image is.
 * @category schemas
 */
export const ImageSource = Schema.Struct({
  /** The type of the image: one of the four types ATIF states for an image. */
  media_type: Schema.Literals(imageMediaTypes),
  /** Where the bytes are: a path relative to the document, an absolute path, or a URL. */
  path: Schema.String,
});

/**
 * An {@link ImageSource} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "ImageSourceSchema (v1.6+)".
 *
 * @see {@link ImageSource} for the schema it is read by.
 * @category models
 */
export type ImageSource = Schema.Schema.Type<typeof ImageSource>;

/**
 * Where the bytes of a recording of speech a part states are: the type of the
 * recording, the path or the URL they are at, and how long it is (v1.8+).
 *
 * ATIF RFC 0001 v1.8, Section II "AudioSourceSchema (v1.8+)".
 *
 * **When to use**
 *
 * Use when reading where the recording of an {@link AudioPart} is, or when
 * stating one — audio is referenced by a location rather than carried by its
 * bytes.
 *
 * **Details**
 *
 * `media_type` is what the recording is, in the spelling the document states it
 * as: one of `audio/wav`, `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/ogg`,
 * `audio/flac`, `audio/webm` or `audio/aiff`, or one of the spellings ATIF tells a
 * consumer to accept beside them, such as the `audio/mp3` a provider's API
 * returns. A part states the spelling it was written with rather than one this
 * package chose, since normalizing it is what a consumer does when it reads the
 * type for a purpose of its own. `path` locates the bytes as {@link ImageSource}
 * locates an image, in an `audio/` beside the document by convention, and
 * `duration_sec` is how long the recording is, where the producer knew it: several
 * providers bill audio by the second and dataset statistics need it, while it
 * cannot be recovered from the bytes without decoding them.
 *
 * Streaming and realtime audio is out of the format — raw PCM and G.711 are not
 * self-describing — and so is video. A transcript of a recording is a
 * {@link TextPart} beside it rather than a field here.
 *
 * @see {@link AudioPart} for the part that states where a recording is.
 * @category schemas
 */
export const AudioSource = Schema.Struct({
  /** The type of the recording, as ATIF states it or as it tells a consumer to accept it. */
  media_type: Schema.Literals([...audioMediaTypes, ...audioMediaTypeSpellings]),
  /** Where the bytes are: a path relative to the document, an absolute path, or a URL. */
  path: Schema.String,
  /** How long the recording is in seconds, where the producer knew it. */
  duration_sec: Schema.optional(Schema.NullOr(Schema.Number)),
});

/**
 * An {@link AudioSource} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "AudioSourceSchema (v1.8+)".
 *
 * @see {@link AudioSource} for the schema it is read by.
 * @category models
 */
export type AudioSource = Schema.Schema.Type<typeof AudioSource>;

/**
 * The text of a message or of a result, as ATIF states it.
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * **When to use**
 *
 * Use when reading the part of a {@link Content} that is text, or when stating
 * one.
 *
 * **Details**
 *
 * A part of `type` `"text"` states the `text` it holds and no `source`: the
 * format states a source for the parts whose bytes are referenced, so a document
 * that writes one beside a text part is rejected rather than read without it.
 *
 * @see {@link Content} for the message a part of this kind is a part of.
 * @category schemas
 */
export const TextPart = Schema.Struct({
  /** What the part is: the text of a message or of a result. */
  type: Schema.Literal("text"),
  /** The text the part states. */
  text: Schema.String,
  /** Must be omitted: a text part states no source of bytes. */
  source: omitted,
});

/**
 * A {@link TextPart} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * @see {@link TextPart} for the schema it is read by.
 * @category models
 */
export type TextPart = Schema.Schema.Type<typeof TextPart>;

/**
 * An image a message or a result states, by the location of its bytes (v1.6+).
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * **When to use**
 *
 * Use when reading the part of a {@link Content} that holds an image, or when
 * stating one.
 *
 * **Details**
 *
 * A part of `type` `"image"` states where its bytes are as an
 * {@link ImageSource}, and states no `text`: the format states a text beside a
 * media part as a part of its own — see {@link TextPart} — so a document that
 * writes one here is rejected rather than read with it dropped. The `source` must
 * be of the kind the `type` states, so a document whose image part carries the
 * source of a recording is rejected rather than read as an image it is not.
 *
 * @see {@link MediaPart} for the parts a message holds where it holds no text.
 * @category schemas
 */
export const ImagePart = Schema.Struct({
  /** What the part is: an image the message or the result holds. */
  type: Schema.Literal("image"),
  /** Where the bytes of the image are. */
  source: ImageSource,
  /** Must be omitted: an image part states where an image is, not what is said of it. */
  text: omitted,
});

/**
 * An {@link ImagePart} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * @see {@link ImagePart} for the schema it is read by.
 * @category models
 */
export type ImagePart = Schema.Schema.Type<typeof ImagePart>;

/**
 * A recording of speech a message or a result states, by the location of its
 * bytes (v1.8+).
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * **When to use**
 *
 * Use when reading the part of a {@link Content} that holds a recording, or when
 * stating one.
 *
 * **Details**
 *
 * A part of `type` `"audio"` states where its bytes are as an
 * {@link AudioSource}, and states no `text`: a transcript is a part of its own
 * that the recording stands beside, so a document that writes one here is
 * rejected rather than read with it dropped. The `source` must be of the kind the
 * `type` states, so a document whose audio part carries the source of an image is
 * rejected rather than read as a recording it is not.
 *
 * @see {@link MediaPart} for the parts a message holds where it holds no text.
 * @category schemas
 */
export const AudioPart = Schema.Struct({
  /** What the part is: a recording the message or the result holds. */
  type: Schema.Literal("audio"),
  /** Where the bytes of the recording are. */
  source: AudioSource,
  /** Must be omitted: a transcript of the recording is a part of its own. */
  text: omitted,
});

/**
 * An {@link AudioPart} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * @see {@link AudioPart} for the schema it is read by.
 * @category models
 */
export type AudioPart = Schema.Schema.Type<typeof AudioPart>;

/**
 * A part of a message that is not text: an image (v1.6+), or a recording of
 * speech (v1.8+).
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * **When to use**
 *
 * Use when reading what ATIF states of a message that holds more than its text.
 *
 * **Details**
 *
 * ATIF states such a part by a location rather than by its bytes, and says what
 * the location holds by the `type` of the part: an {@link ImagePart} is an image,
 * whose {@link ImageSource} is one of the types the format states for an image
 * together with a path or a URL beside the document, and an {@link AudioPart} is a
 * recording, whose {@link AudioSource} is one of the types it states for audio
 * together with a path and, where the producer knew it, the length of the
 * recording.
 *
 * @see {@link Content} for the message a part of this kind is a part of.
 * @category schemas
 */
export const MediaPart = Schema.Union([ImagePart, AudioPart]);

/**
 * A {@link MediaPart} as it is read: an image, or a recording of speech.
 *
 * ATIF RFC 0001 v1.8, Section II "ContentPartSchema (v1.6+)".
 *
 * @see {@link MediaPart} for the schema it is read by.
 * @category models
 */
export type MediaPart = Schema.Schema.Type<typeof MediaPart>;

/**
 * What a message says, or what a result answered with: the text itself, or the
 * parts it is stated as where it holds more than text (v1.6+).
 *
 * ATIF RFC 0001 v1.8, Section II: the `message` field of "StepObject", the
 * `content` field of "ObservationResultSchema", and the parts those fields hold,
 * "ContentPartSchema (v1.6+)".
 *
 * **When to use**
 *
 * Use to read the `message` of a {@link StepObject} or the `content` of an
 * {@link ObservationResult}, which ATIF states the same way.
 *
 * **Details**
 *
 * A text-only content is the string itself; a multimodal one is an array of
 * {@link TextPart} and {@link MediaPart} objects, in the order they are written. A
 * part states the one field its `type` calls for — the `text` a text part holds, or
 * the `source` an image or a trajectory is referenced by — since the format states
 * each of the two for one kind of part alone: a document that writes the other
 * beside one is rejected rather than read with the field it does not state
 * dropped.
 *
 * @see {@link MediaPart} for the parts a message can state beyond its text.
 * @category schemas
 */
export const Content = Schema.Union([
  Schema.String,
  Schema.Array(Schema.Union([TextPart, MediaPart])),
]);

/**
 * A {@link Content} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II: the `message` field of "StepObject", the
 * `content` field of "ObservationResultSchema", and the parts those fields hold,
 * "ContentPartSchema (v1.6+)".
 *
 * @see {@link Content} for the schema it is read by.
 * @category models
 */
export type Content = Schema.Schema.Type<typeof Content>;

/**
 * A call a step made of a tool.
 *
 * ATIF RFC 0001 v1.8, Section II "ToolCallSchema".
 *
 * **When to use**
 *
 * Use when reading the `tool_calls` of an {@link StepObject}, which name the calls
 * an {@link Observation} result answers.
 *
 * **Details**
 *
 * `tool_call_id` is what a result refers to its call by, and `function_name` and
 * `arguments` are what the call said. ATIF states the arguments as the JSON object
 * a model produced, which need not be the parameters of any tool the document names,
 * and `extra` (v1.7+) as what a producer states of the call beyond the format.
 *
 * @see {@link StepObject} for the step a call is made by.
 * @category models
 */
export const ToolCall = Schema.Struct({
  /** The identifier the result of this call answers it by. */
  tool_call_id: Schema.String,
  /** The name of the tool the step called. */
  function_name: Schema.String,
  /** The arguments the call was made with, as the JSON object the model produced. */
  arguments: ProducerFields,
  /** What a producer states of the call beyond the format. */
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link ToolCall} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "ToolCallSchema".
 *
 * @see {@link ToolCall} for the schema it is read by.
 * @category models
 */
export type ToolCall = Schema.Schema.Type<typeof ToolCall>;

/**
 * A reference to a trajectory of delegated work: where the run a subagent left is
 * written, and what it is named by (v1.7+).
 *
 * ATIF RFC 0001 v1.8, Section II "SubagentTrajectoryRefSchema".
 *
 * **When to use**
 *
 * Use when reading what an observation says of the work it delegated, or when
 * stating that a call was answered by a run of another agent.
 *
 * **Details**
 *
 * A reference resolves one of two ways: `trajectory_id` names a document embedded
 * in the `subagent_trajectories` of the document that holds the reference, or
 * `trajectory_path` locates the trajectory of the subagent as a file beside the
 * document. ATIF requires at least one of the two, so a reference that names
 * neither resolves nothing. `session_id` is the run the subagent belonged to, which
 * ATIF keeps for correlation alone — several subagents of one run may share it, so
 * it is no key — and `extra` is what a producer states of the subagent beyond the
 * format.
 *
 * @see {@link ObservationResult} for the result a reference answers a step by.
 * @category models
 */
export const SubagentTrajectoryRef = Schema.Struct({
  /** The `trajectory_id` of an embedded document this reference resolves to. */
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** The path of the file holding the subagent's trajectory, where it is not embedded. */
  trajectory_path: Schema.optional(Schema.NullOr(Schema.String)),
  /** The run the subagent belonged to: informational alone, and shared among siblings. */
  session_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** What a producer states of the subagent beyond the format. */
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link SubagentTrajectoryRef} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "SubagentTrajectoryRefSchema".
 *
 * @see {@link SubagentTrajectoryRef} for the schema it is read by.
 * @category models
 */
export type SubagentTrajectoryRef = Schema.Schema.Type<typeof SubagentTrajectoryRef>;

/**
 * One result a step was answered with: what a tool call returned, or what an action
 * of the agent that is not a call produced.
 *
 * ATIF RFC 0001 v1.8, Section II "ObservationResultSchema".
 *
 * **When to use**
 *
 * Use when reading the `observation` of a {@link StepObject}, which holds the
 * results of the calls it made.
 *
 * **Details**
 *
 * `source_call_id` names the call of its step this answers, and is `null` or absent
 * for a result that names no call: an action of the agent that used no tool, or a
 * system-initiated operation. `content` is what the result answered with, and may be
 * absent where the result refers to a subagent trajectory instead.
 * `subagent_trajectory_ref` (v1.7+) references the trajectories of the work a
 * delegated subagent did, each of them by the `trajectory_id` of an embedded
 * trajectory or by the `trajectory_path` of a file beside the document. `extra`
 * (v1.7+) is what a producer states of the result beyond the format.
 *
 * @see {@link StepObject} for the step a result answers.
 * @category models
 */
export const ObservationResult = Schema.Struct({
  /** The `tool_call_id` of the call of its step this result answers, where one is named. */
  source_call_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** What the call or action answered with. */
  content: Schema.optional(Content),
  /**
   * The trajectories a delegated call left, each of them referenced by an embedded
   * document's id or by the path of a file beside the document.
   */
  subagent_trajectory_ref: Schema.optional(Schema.NullOr(Schema.Array(SubagentTrajectoryRef))),
  /** What a producer states of the result beyond the format. */
  extra: Schema.optional(ProducerFields),
});

/**
 * An {@link ObservationResult} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "ObservationResultSchema".
 *
 * @see {@link ObservationResult} for the schema it is read by.
 * @category models
 */
export type ObservationResult = Schema.Schema.Type<typeof ObservationResult>;

/**
 * What a step was answered with: the results of the calls it made, or of the actions
 * it took.
 *
 * ATIF RFC 0001 v1.8, Section II "ObservationSchema".
 *
 * **When to use**
 *
 * Use when reading the `observation` of a {@link StepObject}.
 *
 * **Details**
 *
 * ATIF states an observation on any step, because a system step (v1.2+) can be
 * answered by a system-initiated operation as well: a subagent delegation, a context
 * transformation, an environment reset, a checkpoint. A result of an agent step is
 * what a tool of the conversation or an action of the agent produced, and one of a
 * system step what an operation of the run did.
 *
 * @see {@link ObservationResult} for one result of an observation.
 * @category models
 */
export const Observation = Schema.Struct({
  /** What the step was answered with, one result per call or action. */
  results: Schema.Array(ObservationResult),
});

/**
 * An {@link Observation} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "ObservationSchema".
 *
 * @see {@link Observation} for the schema it is read by.
 * @category models
 */
export type Observation = Schema.Schema.Type<typeof Observation>;

/**
 * The tokens, the cost and the confidence data of one agent step.
 *
 * ATIF RFC 0001 v1.8, Section II "MetricsSchema".
 *
 * **When to use**
 *
 * Use when reading what a document states of what one inference cost, or when
 * stating one.
 *
 * **Details**
 *
 * `prompt_tokens` counts every input token the model processed, cached and not,
 * and `cached_tokens` the subset of them that were read from a prompt cache rather
 * than processed again. `cost_usd` is the money the call cost, as the producer read
 * it at the time, which the format leaves to the producer rather than deriving from
 * a price list. The token-id arrays and `logprobs` carry what a training pipeline
 * reads off an inference, and `extra` what a provider states beyond the format —
 * reasoning tokens, cache-creation tokens, and the like.
 *
 * @see {@link FinalMetrics} for the same figures summed over a run.
 * @category models
 */
export const Metrics = Schema.Struct({
  /** Every input token the model processed, cached and not. */
  prompt_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** Every token the model generated, reasoning and tool calls among them. */
  completion_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** The input tokens read from a prompt cache, which `prompt_tokens` counts too. */
  cached_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** What the call cost, as the producer read it when the call was made. */
  cost_usd: Schema.optional(Schema.NullOr(Schema.Number)),
  /** The ids of the `prompt_tokens`, for a pipeline that must not retokenize them. */
  prompt_token_ids: Schema.optional(Schema.NullOr(Schema.Array(Schema.Int))),
  /** The ids of the `completion_tokens`, which `logprobs` align with. */
  completion_token_ids: Schema.optional(Schema.NullOr(Schema.Array(Schema.Int))),
  /** The log probability of each completion token. */
  logprobs: Schema.optional(Schema.NullOr(Schema.Array(Schema.Number))),
  /** What a provider states of the inference beyond the format. */
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link Metrics} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "MetricsSchema".
 *
 * @see {@link Metrics} for the schema it is read by.
 * @category models
 */
export type Metrics = Schema.Schema.Type<typeof Metrics>;

/**
 * The tokens and the cost of a run as a whole.
 *
 * ATIF RFC 0001 v1.8, Section II "FinalMetricsSchema".
 *
 * **When to use**
 *
 * Use when reading what a document states of what its run cost, or when stating
 * one.
 *
 * **Details**
 *
 * Each total is the sum of the same figure over the steps of the document,
 * `total_prompt_tokens` counting cached and uncached input tokens alike. `total_steps`
 * is the producer's own count of the run, which the format leaves it to state rather
 * than reading off the length of `steps`. `extra` is what a producer states of the
 * run beyond the format.
 *
 * @see {@link Metrics} for the same figures of one step.
 * @category models
 */
export const FinalMetrics = Schema.Struct({
  /** Every input token of the run, cached and not. */
  total_prompt_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** Every token the run generated. */
  total_completion_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** The input tokens of the run read from a prompt cache. */
  total_cached_tokens: Schema.optional(Schema.NullOr(Schema.Int)),
  /** What the whole run cost, as the producer read it while it ran. */
  total_cost_usd: Schema.optional(Schema.NullOr(Schema.Number)),
  /** The producer's own count of the steps of the run. */
  total_steps: Schema.optional(Schema.NullOr(Schema.Int)),
  /** What a producer states of the run beyond the format. */
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link FinalMetrics} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "FinalMetricsSchema".
 *
 * @see {@link FinalMetrics} for the schema it is read by.
 * @category models
 */
export type FinalMetrics = Schema.Schema.Type<typeof FinalMetrics>;

/**
 * One tool an agent was given, in the shape OpenAI states a function in.
 *
 * ATIF RFC 0001 v1.8, Section II "AgentSchema", the `tool_definitions` an agent
 * was given.
 *
 * **When to use**
 *
 * Use when reading the tools a document says its agent was given (v1.5+).
 *
 * **Details**
 *
 * `type` names the kind of tool, which is `"function"` for the tools ATIF states,
 * and `function` states the tool itself: the `name` it is called by, what it is
 * `description` as, and the `parameters` it accepts, as the JSON schema the model
 * was given rather than as any schema of a program. A reader that knows the tools
 * of its own toolkit reads a call of a step as the call it was and leaves the
 * definitions here; `strict` is OpenAI's, and states whether the arguments must
 * follow the schema exactly.
 *
 * @see {@link Agent} for the agent the definitions were given to.
 * @category models
 */
export const ToolDefinition = Schema.Struct({
  /** The kind of tool: `"function"` for the tools ATIF states. */
  type: Schema.String,
  /** The function the tool names. */
  function: Schema.Struct({
    /** The name the tool is called by. */
    name: Schema.String,
    /** What the tool does, as the model was told. */
    description: Schema.optional(Schema.NullOr(Schema.String)),
    /** The arguments the tool accepts, as the JSON schema the model was given. */
    parameters: Schema.optional(Schema.Unknown),
    /** Whether the arguments must follow the schema exactly, in OpenAI's sense. */
    strict: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),
  /** What a producer states of the tool beyond the format. */
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link ToolDefinition} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "AgentSchema", the `tool_definitions` an agent
 * was given.
 *
 * @see {@link ToolDefinition} for the schema it is read by.
 * @category models
 */
export type ToolDefinition = Schema.Schema.Type<typeof ToolDefinition>;

/**
 * The agent that ran, as the document states it.
 *
 * ATIF RFC 0001 v1.8, Section II "AgentSchema".
 *
 * **When to use**
 *
 * Use when reading what a document says of the agent whose run it is.
 *
 * **Details**
 *
 * `name` and `version` identify the agent system. `model_name` is the model it ran
 * on by default, which a step's own `model_name` overrides; `tool_definitions`
 * (v1.5+) the tools it was given, each of them stated in the shape of an OpenAI
 * function definition with its `type` and `function`; and `extra` what a producer
 * states beyond the format.
 *
 * @see {@link Document} for the document an agent's run is.
 * @category models
 */
export const Agent = Schema.Struct({
  /** The name of the agent system that ran, such as `claude-code`. */
  name: Schema.String,
  /** The version of the agent system that ran. */
  version: Schema.String,
  /** The model the agent ran on by default, which a step's own `model_name` overrides. */
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  /** The tools the agent was given (v1.5+), each of them an OpenAI function definition. */
  tool_definitions: Schema.optional(Schema.NullOr(Schema.Array(ToolDefinition))),
  /** What a producer states of the agent beyond the format. */
  extra: Schema.optional(ProducerFields),
});

/**
 * An {@link Agent} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "AgentSchema".
 *
 * @see {@link Agent} for the schema it is read by.
 * @category models
 */
export type Agent = Schema.Schema.Type<typeof Agent>;

/**
 * One step of a document: a system prompt, a user message, or a complete agent turn.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject".
 *
 * **When to use**
 *
 * Use when reading a document step by step, or when typing a step of one —
 * {@link Document}.
 *
 * **Details**
 *
 * A step holds what ATIF states of one turn of a run: the `message` it states, the
 * agent's `reasoning_content`, the `tool_calls` it made and the `observation` it was
 * answered with. `step_id` is its ordinal among the steps of the document, and
 * `source` says who contributed it.
 *
 * A `source` of `"system"` or `"user"` is a step that states what a model was
 * given, and a step of `"agent"` one that states what it answered. The agent-only
 * fields — `reasoning_content`, `reasoning_effort`, `tool_calls` and `metrics` —
 * are stated on an agent step: ATIF applies them to no other source.
 *
 * `is_copied_context` marks a step a producer copied from a prior trajectory into
 * the current one for context, which a consumer reading steps for training must
 * filter out; and `llm_call_count` states how many LLM inferences a step stands
 * for — one, more when the producer could not split the calls of an opaque tool,
 * or `0` on an agent step for a deterministic dispatch that called tools without
 * an inference.
 *
 * @see {@link Document} for the document a step is a step of.
 * @category models
 */
export const StepObject = Schema.Struct({
  /** The ordinal ATIF numbers the steps of a document from `1` with. */
  step_id: Schema.Int,
  /** When the step occurred, as an ISO 8601 timestamp. */
  timestamp: Schema.optional(Schema.NullOr(Schema.String)),
  /** Who contributed the step: the system prompt, the user, or the agent. */
  source: Schema.Literals(sources),
  /** The model this step was answered by, where it is an agent step. */
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  /** How much effort the step took: a qualitative name, or a numeric score. */
  reasoning_effort: Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))),
  /** What the step said: the dialogue of a message, or what the agent answered. */
  message: Content,
  /** What the agent thought, where it is an agent step that thought. */
  reasoning_content: Schema.optional(Schema.NullOr(Schema.String)),
  /** The tools the step called, where it is an agent step that called any. */
  tool_calls: Schema.optional(Schema.NullOr(Schema.Array(ToolCall))),
  /** What the step was answered with, where it was answered by anything. */
  observation: Schema.optional(Schema.NullOr(Observation)),
  /** The tokens, the cost and the confidence data of the step, where the document states them. */
  metrics: Schema.optional(Schema.NullOr(Metrics)),
  /** Whether the step was copied from a prior trajectory into this one for context. */
  is_copied_context: Schema.optional(Schema.NullOr(Schema.Boolean)),
  /** How many LLM inferences the step represents, where the producer tracked it. */
  llm_call_count: Schema.optional(Schema.NullOr(Schema.Int)),
  /** What a producer states of the step beyond the format. */
  extra: Schema.optional(ProducerFields),
});

/**
 * A {@link StepObject} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject".
 *
 * @see {@link StepObject} for the schema it is read by.
 * @category models
 */
export type StepObject = Schema.Schema.Type<typeof StepObject>;

/**
 * An ATIF document: one run of an agent, as the format carries it.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata".
 *
 * **When to use**
 *
 * Use to read the `trajectory.json` a program that ran an agent wrote, so that what
 * it holds is stated in typed terms — see {@link FromJson} for reading the bytes of
 * a file as one.
 *
 * **Details**
 *
 * A document names the version of the format it conforms to, the agent that ran, and
 * the ordered steps of the run, numbered from `1`. It may state the run the document
 * belongs to under `session_id` — run-scoped, so documents of one run share it, and
 * optional since v1.7 — and an identity of its own among the documents of that run
 * under `trajectory_id` (v1.7+). What else it states is a producer's `notes`, the
 * aggregate `final_metrics` of the run, the document it is continued in, and the
 * `subagent_trajectories` (v1.7+) a subagent reference resolves against, each of them
 * a complete document of its own with a `trajectory_id` unique among them.
 *
 * **Example** (Reading the JSON a `trajectory.json` holds)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Document } from "@trajs/extension-atif"
 *
 * const document = Schema.decodeUnknownSync(Document.FromJson)(
 *   `{"schema_version": "ATIF-v1.7", "agent": {"name": "claude-code", "version": "2.1.222"},
 *     "steps": [{"step_id": 1, "source": "user", "message": "Create hello.txt."}]}`
 * )
 *
 * document.steps.map((step) => step.source) // => ["user"]
 * ```
 *
 * @see {@link StepObject} for the steps a document holds.
 * @category schemas
 */
export const Document: Schema.Codec<Document> = Schema.Struct({
  /** The version of ATIF the document conforms to. */
  schema_version: SchemaVersion,
  /** The agent run the document belongs to, where it states one; run-scoped, and optional since v1.7. */
  session_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** The identity of the document among the ones of a run, where it states one (v1.7+). */
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** The agent that ran. */
  agent: Agent,
  /** The steps of the run, in the order they happened, numbered from `1`. */
  steps: Schema.NonEmptyArray(StepObject),
  /** What a producer wrote of the run itself: its design notes, or what the format does not state. */
  notes: Schema.optional(Schema.NullOr(Schema.String)),
  /** The tokens and the cost of the run as a whole, where the document states them. */
  final_metrics: Schema.optional(Schema.NullOr(FinalMetrics)),
  /** The document this one is continued in, where it is continued in another. */
  continued_trajectory_ref: Schema.optional(Schema.NullOr(Schema.String)),
  /** What a producer states of the document beyond the format. */
  extra: Schema.optional(ProducerFields),
  /** The trajectories of the subagents a step delegated work to (v1.7+). */
  subagent_trajectories: Schema.optional(Schema.Array(Schema.suspend(() => Document))),
});

/**
 * A {@link Document} as it is read.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata".
 *
 * @see {@link Document} for the schema it is read by.
 * @category models
 */
export interface Document {
  /** The version of ATIF the document conforms to. */
  readonly schema_version: (typeof versions)[number];
  /** The agent run the document belongs to, where it states one; run-scoped, and optional since v1.7. */
  readonly session_id?: string | null | undefined;
  /** The identity of the document among the ones of a run, where it states one (v1.7+). */
  readonly trajectory_id?: string | null | undefined;
  /** The agent that ran. */
  readonly agent: Agent;
  /** The steps of the run, in the order they happened, numbered from `1`. */
  readonly steps: readonly [StepObject, ...Array<StepObject>];
  /** What a producer wrote of the run itself: its design notes, or what the format does not state. */
  readonly notes?: string | null | undefined;
  /** The tokens and the cost of the run as a whole, where the document states them. */
  readonly final_metrics?: FinalMetrics | null | undefined;
  /** The document this one is continued in, where it is continued in another. */
  readonly continued_trajectory_ref?: string | null | undefined;
  /** What a producer states of the document beyond the format. */
  readonly extra?: ProducerFields | undefined;
  /** The trajectories of the subagents a step delegated work to (v1.7+). */
  readonly subagent_trajectories?: ReadonlyArray<Document> | undefined;
}

/**
 * The document as the JSON a `trajectory.json` holds.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata", whose JSON this reads.
 *
 * **When to use**
 *
 * Use to read the bytes of a trajectory file as the document they state, rather
 * than to parse the JSON yourself and read the object it holds as a
 * {@link Document}.
 *
 * **Details**
 *
 * The codec reads the string as the JSON document it is written as, so what a file
 * holds is read by one decoder that reports where the JSON ends and the document
 * begins.
 *
 * @see {@link Document} for the document it reads.
 * @category schemas
 */
export const FromJson = Schema.fromJsonString(Document);
