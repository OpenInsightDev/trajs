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
 * parts a message holds where it holds more than text.
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
 * A part of a message that is not text: an image (v1.6+) or a recording of speech
 * (v1.8+).
 *
 * **When to use**
 *
 * Use when reading what ATIF states of a message that holds more than its text.
 *
 * **Details**
 *
 * ATIF states such a part by a location rather than by its bytes: `source` is an
 * `ImageSourceSchema` — a `media_type` of `image/jpeg`, `image/png`, `image/gif`
 * or `image/webp` together with a `path` or a URL beside the document — where the
 * part is an image, and an `AudioSourceSchema` — a `media_type` of `audio/wav`,
 * `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/ogg`, `audio/flac`,
 * `audio/webm` or `audio/aiff`, a `path`, and the `duration_sec` of the recording
 * where the producer knew it — where it is audio.
 *
 * @see {@link Content} for the message a part of this kind is a part of.
 * @category schemas
 */
export const MediaPart = Schema.Struct({
  /** What the part is: an image, or a recording of speech. */
  type: Schema.Literals(["image", "audio"]),
  /** Where the bytes are: the media type, the path or URL, and what a producer added to it. */
  source: Schema.Unknown,
});

/**
 * A {@link MediaPart} as it is read: the kind of part, and where its bytes are.
 *
 * @see {@link MediaPart} for the schema it is read by.
 * @category models
 */
export type MediaPart = Schema.Schema.Type<typeof MediaPart>;

/**
 * The text of a message or of a result, as ATIF states it.
 *
 * @see {@link Content} for the message a part of this kind is a part of.
 * @category schemas
 */
export const TextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});

/**
 * A {@link TextPart} as it is read.
 *
 * @see {@link TextPart} for the schema it is read by.
 * @category models
 */
export type TextPart = Schema.Schema.Type<typeof TextPart>;

/**
 * What a message says, or what a result answered with: the text itself, or the
 * parts it is stated as where it holds more than text (v1.6+).
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
 * part of `type` `"text"` carries the `text` it states and nothing else — the
 * other fields are stated by the {@link MediaPart}s among the parts.
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
 * @see {@link Content} for the schema it is read by.
 * @category models
 */
export type Content = Schema.Schema.Type<typeof Content>;

/**
 * A call a step made of a tool.
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
  arguments: Schema.Record(Schema.String, Schema.Unknown),
  /** What a producer states of the call beyond the format. */
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

/**
 * A {@link ToolCall} as it is read.
 *
 * @see {@link ToolCall} for the schema it is read by.
 * @category models
 */
export type ToolCall = Schema.Schema.Type<typeof ToolCall>;

/**
 * One result a step was answered with: what a tool call returned, or what an action
 * of the agent that is not a call produced.
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
  subagent_trajectory_ref: Schema.optional(Schema.Unknown),
  /** What a producer states of the result beyond the format. */
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

/**
 * An {@link ObservationResult} as it is read.
 *
 * @see {@link ObservationResult} for the schema it is read by.
 * @category models
 */
export type ObservationResult = Schema.Schema.Type<typeof ObservationResult>;

/**
 * What a step was answered with: the results of the calls it made, or of the actions
 * it took.
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
 * @see {@link Observation} for the schema it is read by.
 * @category models
 */
export type Observation = Schema.Schema.Type<typeof Observation>;

/**
 * The agent that ran, as the document states it.
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
  tool_definitions: Schema.optional(Schema.Unknown),
  /** What a producer states of the agent beyond the format. */
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

/**
 * An {@link Agent} as it is read.
 *
 * @see {@link Agent} for the schema it is read by.
 * @category models
 */
export type Agent = Schema.Schema.Type<typeof Agent>;

/**
 * One step of a document: a system prompt, a user message, or a complete agent turn.
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
  metrics: Schema.optional(Schema.Unknown),
  /** Whether the step was copied from a prior trajectory into this one for context. */
  is_copied_context: Schema.optional(Schema.NullOr(Schema.Boolean)),
  /** How many LLM inferences the step represents, where the producer tracked it. */
  llm_call_count: Schema.optional(Schema.NullOr(Schema.Int)),
  /** What a producer states of the step beyond the format. */
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

/**
 * A {@link StepObject} as it is read.
 *
 * @see {@link StepObject} for the schema it is read by.
 * @category models
 */
export type StepObject = Schema.Schema.Type<typeof StepObject>;

/**
 * An ATIF document: one run of an agent, as the format carries it.
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
export const Document = Schema.Struct({
  /** The version of ATIF the document conforms to. */
  schema_version: Schema.Literals(versions),
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
  final_metrics: Schema.optional(Schema.Unknown),
  /** The document this one is continued in, where it is continued in another. */
  continued_trajectory_ref: Schema.optional(Schema.NullOr(Schema.String)),
  /** What a producer states of the document beyond the format. */
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  /** The trajectories of the subagents a step delegated work to (v1.7+). */
  subagent_trajectories: Schema.optional(Schema.Array(Schema.Unknown)),
});

/**
 * A {@link Document} as it is read.
 *
 * @see {@link Document} for the schema it is read by.
 * @category models
 */
export type Document = Schema.Schema.Type<typeof Document>;

/**
 * The document as the JSON a `trajectory.json` holds.
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
