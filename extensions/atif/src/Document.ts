/**
 * The ATIF document, read as a recording.
 *
 * ATIF — the Agent Trajectory Interchange Format — carries a run as one JSON
 * document: the agent that ran, the ordered steps of its conversation, and the
 * metrics of the run. This module states that document in this package's own terms
 * — {@link Document} and the schemas it is made of — and {@link of} reads one as the
 * recording it states, so a `trajectory.json` a program that ran elsewhere wrote is
 * a `@trajs/core` trajectory: {@link Step.steps} reads it back as the steps it was
 * read from, and every other reader of a trajectory — {@link View}, `Codec`, the
 * kits a run records with — reads it as one.
 *
 * What is read of a document is the conversation its steps hold. What a document
 * states beyond that — the ordinal of a step, the model that answered it, the
 * tokens it cost, the tools the agent was given, the subagent trajectories an
 * observation refers to — is not read: a recording holds the parts a session ran on
 * and what a kit derived of them, so a document read as one states what its steps
 * said and leaves what it says around them at the door rather than inventing a part
 * for it. {@link of} says of each field of the document what becomes of it, and
 * {@link Step.Step} says of what a recording holds what ATIF states of a step.
 */

import { Event, Extra, Metric, Produce, Prompt, Response, Toolkit, Trajectory } from "@trajs/core";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect, Predicate, Schema } from "effect";

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
 * Use when reading what ATIF states of a message, so that a message that holds more
 * than its text reads as the message it is rather than as one it is not.
 *
 * **Details**
 *
 * ATIF states such a part by a location — a media type and a path or a URL beside
 * the document — while a recording holds the bytes themselves and no location, so
 * what a part of this kind states is what a message of a recording cannot carry.
 * The location is read as the document states it and is not read by this package:
 * see {@link Content} for what a message is read for.
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
 * Both forms are read as the text of what they state: a string is itself, and the
 * parts are the text of the {@link TextPart}s among them, in the order they are
 * written. A {@link MediaPart} carries no text, so a message that is only parts of
 * that kind says nothing — see {@link MediaPart} for why what it states is not read.
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
 * a model produced, which is the parameter value of a tool call part of a recording
 * rather than the parameters of a tool the recording knows: a document states the
 * tools of the agent that ran rather than a toolkit a recording reads its parts
 * with, so a call records as the call it was — see {@link of}.
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
 * for a result that names no call — an action of the agent, or a call a producer left
 * unnamed, which the reading answers against the calls of the step, see {@link of}.
 * `content` is what the result answered with, and `subagent_trajectory_ref` a
 * trajectory of the work a delegated subagent did, which a recording of this package
 * does not read yet.
 *
 * @see {@link StepObject} for the step a result answers.
 * @category models
 */
export const ObservationResult = Schema.Struct({
  /** The `tool_call_id` of the call of its step this result answers, where one is named. */
  source_call_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** What the call or action answered with. */
  content: Schema.optional(Content),
  /** The subagent trajectories a delegated call left, which this package does not read. */
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
 * ATIF states an observation on any step, because a system step can be answered by
 * a system-initiated operation as well: an environment reset, a checkpoint, a
 * delegation. This package reads the results of an agent step, which are the ones a
 * tool of the conversation answered; what a system step is answered with is one of
 * the operations a recording does not model yet, and is not read.
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
 * Use when reading what a document says of the agent whose run it is, such as to
 * name the recording the document is read as.
 *
 * **Details**
 *
 * `name` and `version` name the agent and are what the reading of a document names
 * the recording by — see {@link of}. `model_name` is the model the agent ran on by
 * default, and `tool_definitions` the tools it was given in the format's own terms:
 * neither is read into a recording, which names a model per part rather than per run
 * and reads its tool calls through the toolkit its parts were recorded with. What a
 * producer states beyond the format is under `extra`.
 *
 * @see {@link Document} for the document an agent's run is.
 * @category models
 */
export const Agent = Schema.Struct({
  /** The name of the agent system that ran, such as `claude-code`. */
  name: Schema.String,
  /** The version of the agent system that ran. */
  version: Schema.String,
  /** The model the agent ran on by default, which the reading does not read. */
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  /** The tools the agent was given, in the format's own terms, which the reading does not read. */
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
 * Use when reading a document step by step, or when typing one read by this package
 * — {@link Document}.
 *
 * **Details**
 *
 * A step holds what ATIF states of one turn of a run, and {@link of} records what of
 * it a recording is made of: the `message`, the agent's `reasoning_content`, the
 * `tool_calls` it made and the `observation` it was answered with. The rest of the
 * step — its `step_id`, its `timestamp`, the `model_name` that answered it, the
 * `metrics` it cost, whether it was `is_copied_context`, how many LLM calls it
 * `llm_call_count` represents, and what a producer states under `extra` — is read as
 * the document states it and is not recorded: a document that states these fields is
 * decoded rather than refused, and what a recording makes of them is nothing, since
 * it holds the parts a session ran on and what a kit derived of them rather than a
 * producer's account of either. See {@link of} for what the reading does with each
 * field.
 *
 * A `source` of `"system"` or `"user"` is a step that states what a model was
 * given, and a step of `"agent"` one that states what it answered — the mapping
 * {@link Step.StepSource} reads a recording back by.
 *
 * @see {@link Document} for the document a step is a step of.
 * @see {@link of} for the recording a step is read as.
 * @category models
 */
export const StepObject = Schema.Struct({
  /** The ordinal ATIF numbers the steps of a document from `1` with. */
  step_id: Schema.Int,
  /** When the step occurred, which the reading does not record. */
  timestamp: Schema.optional(Schema.NullOr(Schema.String)),
  /** Who contributed the step: the system prompt, the user, or the agent. */
  source: Schema.Literals(sources),
  /** The model this step was answered by, which the reading does not record. */
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  /** How much effort the step took, which the reading does not record. */
  reasoning_effort: Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))),
  /** What the step said: the dialogue of a message, or what the agent answered. */
  message: Content,
  /** What the agent thought, where it is an agent step that thought. */
  reasoning_content: Schema.optional(Schema.NullOr(Schema.String)),
  /** The tools the step called, where it is an agent step that called any. */
  tool_calls: Schema.optional(Schema.NullOr(Schema.Array(ToolCall))),
  /** What the step was answered with, where it was answered by anything. */
  observation: Schema.optional(Schema.NullOr(Observation)),
  /** The tokens and the cost of the step, which the reading does not record. */
  metrics: Schema.optional(Schema.Unknown),
  /** Whether the step was copied from a prior trajectory, which the reading does not record. */
  is_copied_context: Schema.optional(Schema.NullOr(Schema.Boolean)),
  /** How many LLM inferences the step represents, which the reading does not record. */
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
 * Use to read the `trajectory.json` a program that ran a model wrote, so that the
 * run it holds is read on this package's own terms — {@link of} — rather than by
 * the reader of each field.
 *
 * **Details**
 *
 * A document names the version of the format it conforms to, the agent that ran,
 * and the ordered steps of the run. What else it states — the run and the document
 * identity, the note a producer left, the aggregate metrics of the run, the
 * document it is continued in, the subagent trajectories it embeds — is read as the
 * document states it, and this package reads of it what {@link of} says.
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
 * @see {@link of} for the recording a document is read as.
 * @category schemas
 */
export const Document = Schema.Struct({
  /** The version of ATIF the document conforms to. */
  schema_version: Schema.Literals(versions),
  /** The run the document belongs to, where it states one. */
  session_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** The identity of the document among the ones of a run, where it states one. */
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** The agent that ran. */
  agent: Agent,
  /** The steps of the run, in the order they happened, numbered from `1`. */
  steps: Schema.NonEmptyArray(StepObject),
  /** What a producer wrote of the run itself: its design notes, or what the format does not state. */
  notes: Schema.optional(Schema.NullOr(Schema.String)),
  /** The tokens and the cost of the run as a whole, which the reading does not record. */
  final_metrics: Schema.optional(Schema.Unknown),
  /** The document this one is continued in, which the reading does not read. */
  continued_trajectory_ref: Schema.optional(Schema.NullOr(Schema.String)),
  /** What a producer states of the document beyond the format. */
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  /** The trajectories of the subagents a step delegated work to, which the reading does not read. */
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

/**
 * The session a document's steps are recorded in, where the document names none.
 *
 * ATIF states the run a document belongs to for the document as a whole — the
 * steps of a document are the turns of one run — and `session_id` is optional since
 * ATIF v1.7, while a recording names every part by the session that recorded it. A
 * document that states neither a run nor an identity of its own is therefore
 * recorded in this session: a name of the reading's own rather than one of the
 * document's, and one a caller reading the recording can tell from a run that was
 * named.
 */
const unnamedSession = "atif";

const sessionIdOf = (document: Document): string =>
  document.session_id ?? document.trajectory_id ?? unnamedSession;

/**
 * The text of what a message says or a result answered with: a string as it is, and
 * the parts of one as the text of the parts that are text.
 *
 * A part that is not text carries none, so it says nothing of the message it is part
 * of — see {@link MediaPart}.
 */
const textOf = (content: Content): string => {
  if (Predicate.isString(content)) return content;

  let text = "";

  for (const part of content) {
    if (part.type === "text") text += part.text;
  }

  return text;
};

const promptOf = (step: StepObject): Prompt.Prompt =>
  Prompt.fromMessages([
    step.source === "system"
      ? Prompt.makeMessage("system", { content: textOf(step.message) })
      : Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: textOf(step.message) })],
        }),
  ]);

/**
 * The id a result that answers no call is recorded under: the step that was answered
 * and the position of the result in it, which name it without colliding with the id
 * of any call.
 */
const resultId = (step: StepObject, at: number): string => `${step.step_id}-${at + 1}`;

/**
 * The results a step was answered with, as the tool results of a recording.
 *
 * A result that names no call answers the first call of its step that no result has
 * answered yet, since the calls of a step are answered in the order they were made; a
 * result beyond those calls is one of an action, which ATIF states without a tool.
 */
const resultsOf = (step: StepObject): ReadonlyArray<Response.AnyToolResultPart> => {
  const calls = step.tool_calls ?? [];
  const answered = new Set<string>();
  const parts: Response.AnyToolResultPart[] = [];

  for (const [at, result] of (step.observation?.results ?? []).entries()) {
    const stated = result.source_call_id ?? undefined;

    const call =
      stated === undefined
        ? calls.find((call) => !answered.has(call.tool_call_id))
        : calls.find((call) => call.tool_call_id === stated);

    if (call !== undefined) answered.add(call.tool_call_id);

    const content = result.content === undefined ? "" : textOf(result.content);

    if (call === undefined && content === "") continue;

    parts.push(
      Response.anyToolResultPart({
        id: call?.tool_call_id ?? resultId(step, at),
        name: call?.function_name ?? "",
        isFailure: false,
        result: content,
        encodedResult: content,
        providerExecuted: false,
        preliminary: false,
      }),
    );
  }

  return parts;
};

/**
 * The parts a model returned for one step, in the order it returned them.
 *
 * A step of another source returns nothing: what it states is a message a model was
 * given rather than an answer, which is the prompt of its turn.
 */
const responsesOf = (step: StepObject): ReadonlyArray<Response.AllPartsView<{}>> => {
  if (step.source !== "agent") return [];

  const parts: Response.AllPartsView<{}>[] = [];

  const reasoning = step.reasoning_content ?? "";

  if (reasoning !== "") parts.push(Response.makePart("reasoning", { text: reasoning }));

  const message = textOf(step.message);

  if (message !== "") parts.push(Response.makePart("text", { text: message }));

  for (const call of step.tool_calls ?? []) {
    parts.push(
      Response.anyToolCallPart({
        id: call.tool_call_id,
        name: call.function_name,
        params: call.arguments,
        providerExecuted: false,
      }),
    );
  }

  for (const result of resultsOf(step)) parts.push(result);

  return parts;
};

/** One turn as {@link turnsOf} builds it, before it is recorded. */
interface Turn {
  prompt: Prompt.Prompt;
  response: Array<Response.AllPartsView<{}>>;
  /** Whether an agent step has answered the turn already. */
  answered: boolean;
}

/**
 * The turns a document's steps are read as.
 *
 * A step that answers a turn an agent step has answered already opens one of its own,
 * since ATIF states one step per inference while a recording holds what a model was
 * given before each of them: the model was called again on the same messages with the
 * results of the calls in between, which are the parts recorded before it — so the
 * turn opens with no message of its own rather than repeating what the model was given.
 */
const turnsOf = (document: Document): ReadonlyArray<Turn> => {
  const turns: Turn[] = [];

  for (const step of document.steps) {
    const open = step.source === "agent" ? turns.at(-1) : undefined;

    if (open !== undefined && !open.answered) {
      for (const part of responsesOf(step)) open.response.push(part);
      open.answered = true;

      continue;
    }

    turns.push({
      prompt: step.source === "agent" ? Prompt.empty : promptOf(step),
      response: step.source === "agent" ? [...responsesOf(step)] : [],
      answered: step.source === "agent",
    });
  }

  return turns;
};

/** The tools a document's calls are read with, which name nothing; see {@link Config}. */
const toolkit = Toolkit.empty;

/** The events a document's parts can name, which are none; see {@link Config}. */
const eventkit = Event.makeKit();

/** The metrics a document's parts are read for, which are none; see {@link Config}. */
const metrickit = Metric.makeKit();

/** The extra data a document's parts hold, which is none; see {@link Config}. */
const extrakit = Extra.makeKit();

/**
 * What a document is read with: the kits a recording states, which here hold nothing.
 *
 * **When to use**
 *
 * Use to type the trajectory {@link of} returns, or to read one of the recordings it
 * returns in terms of the kits it was read with.
 *
 * **Details**
 *
 * - `stream` is `true`: what a model returned is recorded in the parts it arrived in
 *   rather than as the parts it is whole in, which is what a recording of a run
 *   states — see {@link Trajectory.ResponsePart}. A document states the whole of what
 *   a model answered, and a whole part reads as itself where a recording streams.
 * - `toolkit`, `eventkit`, `metrickit` and `extrakit` name nothing. A document states
 *   the tools an agent was given in the format's own terms rather than a toolkit, and
 *   the parts of a step record the calls of those tools as the calls they were — so
 *   they read as the tool parts the toolkit does not describe rather than as parts of
 *   tools a recording knows. What else a kit states — an event of a system step, a
 *   count derived of a part, extra data a producer attached — is what a run records
 *   of itself, and a document states the run rather than the kit that read it.
 *
 * @see {@link of} for the trajectory it types.
 * @category models
 */
export type Config = Trajectory.Config<
  true,
  typeof toolkit,
  typeof eventkit,
  typeof metrickit,
  typeof extrakit
>;

/** The tools a document's calls are read with, which name nothing. */
type Tools = Config["toolkit"]["tools"];

/** The events a document can name, which are none. */
type Events = Config["eventkit"]["events"];

/** The extra data a document's parts hold, which is none. */
type Extras = Config["extrakit"]["extra"];

/**
 * Records the turns of a document, in the order the document states them.
 *
 * The session is declared before the parts recorded in it, since every part of a
 * recording names the session that recorded it and a document states one run rather
 * than a session per step.
 */
const record = (
  producer: Produce.Producer<Tools, Events, Extras>,
  document: Document,
): Effect.Effect<void, TrajectoryError> =>
  Effect.gen(function* () {
    const session = yield* producer.createSession({ id: sessionIdOf(document) });

    for (const turn of turnsOf(document)) {
      yield* session.enqueuePrompt(turn.prompt);

      for (const part of turn.response) yield* session.enqueueResponse(part);
    }
  });

/**
 * Reads an ATIF document as the recording it states.
 *
 * **When to use**
 *
 * Use when a run another program recorded as ATIF — the `trajectory.json` Harbor
 * writes for an agent it ran — is to be read on this package's own terms: to read it
 * step by step with {@link Step.steps}, to display it, to fold it back into the
 * prompt its model was given with {@link View.prompt}, or to hand it to a model
 * again with `Codec`.
 *
 * **Details**
 *
 * The reading records the steps of the document with `Produce.produce`, one turn of
 * the recording per step: a step that states a message opens a turn with it, and an
 * agent step is recorded as the parts of a response — what the agent thought, what it
 * said, the tools it called, and the results of those calls — in the order the step
 * states them. A result that names no call answers the first call of its step that no
 * result has answered yet, since the calls of a step are answered in the order they
 * were made. A result beyond those calls is one of an action, which ATIF states
 * without a tool, so it is recorded under an id of its own and no tool name; one that
 * states no text either states nothing of the conversation a recording holds, and is
 * not recorded. Everything else the document states is left out rather than invented,
 * since a recording holds the parts a session ran on and what a kit derived of them
 * rather than a producer's account of one:
 *
 * - The ordinal of a step, the moment it happened, the model that answered it, what
 *   it cost, whether it repeats an earlier trajectory and how many inferences it
 *   stands for are the document's own account of the run. A recording times the parts
 *   it holds when they are recorded, names a model per turn where a model was run, and
 *   counts what a metric kit derives — none of which a document states.
 * - The tools an agent was given are stated in the format's own terms rather than as
 *   the tools of a toolkit, so the calls of a step are recorded as the calls they were
 *   and read as the tool parts the reading toolkit does not describe — see
 *   {@link Config}.
 * - What a step holds beyond its text — an image, a recording of speech, the
 *   trajectory of a delegated subagent — is stated by a location or by another
 *   document, and neither is a part a recording holds.
 * - What a system step is answered with is an operation of the run rather than of the
 *   conversation, which a recording does not model yet.
 * - The context management a system step declares, which the package records as an
 *   event of its own — {@link ContextManagement} — rather than as a field of a
 *   document. The reading states the system step and does not record the event yet.
 *
 * The session of the recording is named by `session_id`, or by `trajectory_id` where
 * the document states no run; a document that states neither is recorded in a session
 * of the reading's own. The recording states the agent that ran as its metadata, and
 * what a kit derives of its parts is nothing, since the kits it is read with name
 * nothing.
 *
 * The trajectory fails with the {@link TrajectoryError} a recording whose session
 * cannot be declared fails with, which a document of steps that one session records
 * does not.
 *
 * **Example** (Reading the run Harbor recorded for the `hello.txt` task)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Document, Step } from "@trajs/extension-atif"
 *
 * // The steps of the `trajectory.json` Harbor's Claude Code adapter writes for the
 * // task of creating `hello.txt`, with the metrics of each step and the tools of the
 * // agent left out and the results shortened: the instruction, the call that wrote
 * // the file together with the result it was answered by, and what the agent said of
 * // it.
 * const document = Schema.decodeUnknownSync(Document.Document)({
 *   schema_version: "ATIF-v1.7",
 *   session_id: "d7d4e19e-608d-44ef-b166-cd050ef274ba",
 *   agent: { name: "claude-code", version: "2.1.222" },
 *   steps: [
 *     {
 *       step_id: 1,
 *       source: "user",
 *       message: 'Create a file called hello.txt with "Hello, world!" as the content.'
 *     },
 *     {
 *       step_id: 2,
 *       source: "agent",
 *       message: "",
 *       tool_calls: [
 *         {
 *           tool_call_id: "toolu_01Rmm2GPxpGq9Er31axjfYRv",
 *           function_name: "Write",
 *           arguments: { file_path: "/app/hello.txt", content: "Hello, world!\\n" }
 *         }
 *       ],
 *       observation: {
 *         results: [
 *           {
 *             source_call_id: "toolu_01Rmm2GPxpGq9Er31axjfYRv",
 *             content: "File created successfully at: /app/hello.txt"
 *           }
 *         ]
 *       }
 *     },
 *     { step_id: 3, source: "agent", message: "Created `/app/hello.txt`." }
 *   ]
 * })
 *
 * const recording = Document.of(document)
 *
 * // The recording is a trajectory like any other: its steps read back as the ones
 * // the document holds, since a step's calls and their results are the parts it
 * // answered with, and the turns after the first open with no message of their own.
 * const steps = Array.from(await Effect.runPromise(Stream.runCollect(Step.steps(recording))))
 *
 * steps.map((step) => step.source) // => ["user", "agent", "agent"]
 * steps[1].toolCalls.map((call) => call.name) // => ["Write"]
 * steps[1].observations.map((result) => result.id) // => ["toolu_01Rmm2GPxpGq9Er31axjfYRv"]
 * recording.metadata.name // => "claude-code"
 * ```
 *
 * @see {@link Document} for the document it reads.
 * @see {@link Step.steps} for reading the recording back as the steps it holds.
 * @see {@link Config} for the kits the recording is read with.
 * @category constructors
 */
export const of = (document: Document): Trajectory.Trajectory<Config, TrajectoryError, never> =>
  Produce.produce({
    toolkit,
    eventkit,
    // A kit that names no metric derives nothing, so the recording holds the parts
    // its steps were read as and no metric part.
    metrickit: Metric.toProducers(metrickit, {}),
    extrakit,
    metadata: new Trajectory.Metadata({
      name: document.agent.name,
      description: `${document.schema_version} of ${document.agent.name} ${document.agent.version}`,
    }),
  })((producer) => record(producer, document));
