/**
 * An ATIF document read as the turns of a trajectory.
 *
 * A step that states a message opens a turn with it, an agent step is produced as the
 * parts of the response it answered with, and a step that follows an answered turn opens
 * one of its own with no message.
 */

import { DateTime, Effect, FileSystem, Option, Path, Predicate, Schema } from "effect";
import type { PlatformError } from "effect";

import type * as Extra from "#/Extra.ts";
import * as Produce from "#/Produce.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import type { Content, Document, StepObject } from "#/unstable/atif/Document.ts";
import * as AtifEvent from "#/unstable/atif/Event.ts";
import {
  callExtra,
  CallFields,
  DocumentFields,
  documentExtra,
  extrakit,
  mediaExtra,
  MediaFields,
  resultExtra,
  ResultFields,
  StepFields,
  stepExtra,
} from "#/unstable/atif/Extra.ts";
import type { Tools } from "#/unstable/atif/internal/toolkit.ts";

/** What the reading reads a document with: the files it serves, and the paths it names. */
type Services = FileSystem.FileSystem | Path.Path;

/** The session a document's steps are produced in, where the document names none. */
const unnamedSession = "atif";

/**
 * The id of the session a document's steps are produced in.
 *
 * `session_id` names the run. Every document of one run states the same value, so
 * it names no session.
 */
const sessionIdOf = (document: Document): string => document.trajectory_id ?? unnamedSession;

/** What a document states of one tool definition beside the tool it names. */
type ToolFields = NonNullable<DocumentFields["agent"]["tool_definitions"]>[string];

/** What a document states of each tool definition beside the tool it names, by that name. */
const toolFieldsOf = (agent: Document["agent"]): DocumentFields["agent"]["tool_definitions"] => {
  const definitions = agent.tool_definitions ?? [];

  if (definitions.length === 0) return undefined;

  const stated: Record<string, ToolFields> = {};

  for (const definition of definitions) {
    stated[definition.function.name] = {
      type: definition.type,
      strict: definition.function.strict,
      extra: definition.extra,
    };
  }

  return stated;
};

/** What a document states of the run itself, held by the session part. */
const documentFields = (document: Document): DocumentFields =>
  DocumentFields.make({
    version: DocumentFields.fields.version.literal,
    schema_version: document.schema_version,
    agent: {
      name: document.agent.name,
      version: document.agent.version,
      model_name: document.agent.model_name,
      tool_definitions: toolFieldsOf(document.agent),
      extra: document.agent.extra,
    },
    trajectory_id: document.trajectory_id,
    notes: document.notes,
    final_metrics: document.final_metrics,
    extra: document.extra,
  });

/** What a document states of one step beyond what it says, held by the part of that step. */
const stepFields = (step: StepObject): StepFields =>
  StepFields.make({
    version: StepFields.fields.version.literal,
    step_id: step.step_id,
    model_name: step.model_name,
    reasoning_effort: step.reasoning_effort,
    llm_call_count: step.llm_call_count,
    metrics: step.metrics,
    extra: step.extra,
  });

/** The moment a document times a step at, where it states one that reads. */
const momentOf = (step: StepObject): DateTime.Utc | undefined =>
  step.timestamp === undefined || step.timestamp === null
    ? undefined
    : Option.getOrUndefined(
        Schema.decodeUnknownOption(Schema.DateTimeUtcFromString)(step.timestamp),
      );

/** What a document states of one step. */
interface Stated {
  readonly fields: StepFields;
  readonly moment: DateTime.Utc | undefined;
}

/** What a document states of a step, read from the step. */
const statedOf = (step: StepObject): Stated => ({
  fields: stepFields(step),
  moment: momentOf(step),
});

/** The extra data the part of a step holds. */
const extraOf = (
  states: Stated | undefined,
): Extra.ExtraRecord<(typeof extrakit)["extra"], "prompt"> =>
  states === undefined ? {} : { [stepExtra.tag]: states.fields };

/**
 * What a message or a result states, as the pieces the reading produces of it.
 *
 * A run of text parts is one piece, since what a trajectory states is what was said
 * rather than how the producer split it up.
 */
type Piece =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "file";
      readonly mediaType: string;
      readonly data: Uint8Array;
      /** The seconds the recording lasts, where the document states one. */
      readonly duration: number | null | undefined;
    };

/** The path a piece is read from, under the directory the reading is given where it is relative. */
const pathOf = (stated: string, cwd: string | undefined, paths: Path.Path): string =>
  cwd === undefined || paths.isAbsolute(stated) ? stated : paths.join(cwd, stated);

/**
 * The pieces a content states, in the order it states them.
 *
 * The bytes are read through the file system under the directory the reading is given.
 */
const piecesOf = (
  content: Content,
  cwd: string | undefined,
): Effect.Effect<ReadonlyArray<Piece>, PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    if (Predicate.isString(content)) return [{ kind: "text", text: content }];

    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const pieces: Piece[] = [];
    let text = "";

    for (const part of content) {
      if (part.type === "text") {
        text += part.text;
        continue;
      }

      if (text !== "") {
        pieces.push({ kind: "text", text });
        text = "";
      }

      pieces.push({
        kind: "file",
        mediaType: part.source.media_type,
        data: yield* fs.readFile(pathOf(part.source.path, cwd, paths)),
        duration: part.type === "audio" ? part.source.duration_sec : undefined,
      });
    }

    if (text !== "") pieces.push({ kind: "text", text });

    return pieces;
  });

/**
 * The durations a document states of the media of a part, by the ordinal of the media
 * among the ones the part states.
 */
const durationsOf = (pieces: ReadonlyArray<Piece>): Record<string, number> | undefined => {
  const stated: Record<string, number> = {};
  let ordinal = 0;
  let some = false;

  for (const piece of pieces) {
    if (piece.kind === "text") continue;

    if (piece.duration !== undefined && piece.duration !== null) {
      stated[String(ordinal)] = piece.duration;
      some = true;
    }

    ordinal += 1;
  }

  return some ? stated : undefined;
};

/**
 * What a part holds of the media it states, which the bytes of a recording do not say.
 */
const mediaOf = (
  pieces: ReadonlyArray<Piece>,
): Partial<Record<typeof mediaExtra.tag, MediaFields>> => {
  const duration = durationsOf(pieces);

  return duration === undefined
    ? {}
    : {
        [mediaExtra.tag]: MediaFields.make({
          version: MediaFields.fields.version.literal,
          duration,
        }),
      };
};

/** The text of the pieces given, which is what they say of the step they are of. */
const textOf = (pieces: ReadonlyArray<Piece>): string => {
  let text = "";

  for (const piece of pieces) {
    if (piece.kind === "text") text += piece.text;
  }

  return text;
};

/** The text a content states, read without the media it holds. */
const textOfContent = (content: Content): string => {
  if (Predicate.isString(content)) return content;

  let text = "";

  for (const part of content) {
    if (part.type === "text") text += part.text;
  }

  return text;
};

/** A response part the reading produces, and the extra data the document states of it. */
interface ProducedPart {
  readonly part: Response.AllPartsView<{}>;
  readonly extra: Extra.ExtraRecord<(typeof extrakit)["extra"], "response">;
}

/** The turn message a step states, and the extra data the document states of it. */
interface StatedPrompt {
  readonly prompt: Prompt.Prompt;
  readonly extra: Extra.ExtraRecord<(typeof extrakit)["extra"], "prompt">;
}

/**
 * The turn a step opens, as the one message the step states.
 *
 * A `system` step is text alone; every other step is the user's side of the conversation.
 */
const promptOf = (
  step: StepObject,
  cwd: string | undefined,
): Effect.Effect<StatedPrompt, PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    if (step.source === "system") {
      return {
        prompt: Prompt.fromMessages([
          Prompt.makeMessage("system", { content: textOfContent(step.message) }),
        ]),
        extra: {},
      };
    }

    const pieces = yield* piecesOf(step.message, cwd);

    const content: Array<Prompt.UserMessagePart> =
      pieces.length === 0
        ? [Prompt.makePart("text", { text: "" })]
        : pieces.map((piece) =>
            piece.kind === "text"
              ? Prompt.makePart("text", { text: piece.text })
              : Prompt.makePart("file", { mediaType: piece.mediaType, data: piece.data }),
          );

    return {
      prompt: Prompt.fromMessages([Prompt.makeMessage("user", { content })]),
      extra: mediaOf(pieces),
    };
  });

/** The id a result that answers no call is produced under. */
const resultId = (step: StepObject, at: number): string => `${step.step_id}-${at + 1}`;

/**
 * The results a step was answered with, as tool results and the files they hold.
 *
 * A result that names no call answers the first unanswered call of its step. A result
 * that states neither content nor a call is not produced, so what a producer wrote of
 * it is not carried either.
 */
const resultsOf = (
  step: StepObject,
  cwd: string | undefined,
): Effect.Effect<ReadonlyArray<ProducedPart>, PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    const calls = step.tool_calls ?? [];
    const answered = new Set<string>();
    const parts: ProducedPart[] = [];

    for (const [at, result] of (step.observation?.results ?? []).entries()) {
      const stated = result.source_call_id ?? undefined;

      const call =
        stated === undefined
          ? calls.find((call) => !answered.has(call.tool_call_id))
          : calls.find((call) => call.tool_call_id === stated);

      if (call !== undefined) answered.add(call.tool_call_id);

      const pieces = result.content === undefined ? [] : yield* piecesOf(result.content, cwd);
      const content = textOf(pieces);
      const files = pieces.filter((piece) => piece.kind === "file");

      if (call === undefined && content === "" && files.length === 0) continue;

      parts.push({
        part: Response.anyToolResultPart({
          id: call?.tool_call_id ?? resultId(step, at),
          name: call?.function_name ?? "",
          isFailure: false,
          result: content,
          encodedResult: content,
          providerExecuted: false,
          preliminary: false,
        }),
        extra: {
          [resultExtra.tag]: ResultFields.make({
            version: ResultFields.fields.version.literal,
            source_call_id: stated,
            extra: result.extra,
          }),
        },
      });

      for (const file of files) {
        parts.push({
          part: Response.makePart("file", { mediaType: file.mediaType, data: file.data }),
          extra: mediaOf([file]),
        });
      }
    }

    return parts;
  });

/**
 * The parts a model returned for one step, in the order it returned them.
 *
 * A step of another source returns nothing.
 */
const responsesOf = (
  step: StepObject,
  cwd: string | undefined,
): Effect.Effect<ReadonlyArray<ProducedPart>, PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    if (step.source !== "agent") return [];

    const parts: ProducedPart[] = [];

    const reasoning = step.reasoning_content ?? "";

    if (reasoning !== "") {
      parts.push({ part: Response.makePart("reasoning", { text: reasoning }), extra: {} });
    }

    for (const piece of yield* piecesOf(step.message, cwd)) {
      if (piece.kind === "text") {
        if (piece.text !== "") {
          parts.push({ part: Response.makePart("text", { text: piece.text }), extra: {} });
        }

        continue;
      }

      parts.push({
        part: Response.makePart("file", { mediaType: piece.mediaType, data: piece.data }),
        extra: mediaOf([piece]),
      });
    }

    for (const call of step.tool_calls ?? []) {
      parts.push({
        part: Response.anyToolCallPart({
          id: call.tool_call_id,
          name: call.function_name,
          params: call.arguments,
          providerExecuted: false,
        }),
        extra:
          call.extra === undefined
            ? {}
            : {
                [callExtra.tag]: CallFields.make({
                  version: CallFields.fields.version.literal,
                  extra: call.extra,
                }),
              },
      });
    }

    for (const result of yield* resultsOf(step, cwd)) parts.push(result);

    return parts;
  });

/** One turn as {@link turnsOf} builds it, before it is produced. */
interface Turn {
  prompt: Prompt.Prompt;
  /** What the document states of the media the prompt holds. */
  promptExtra: Extra.ExtraRecord<(typeof extrakit)["extra"], "prompt">;
  /** What the document states of the step that stated the prompt. */
  promptStates: Stated | undefined;
  response: Array<ProducedPart>;
  /** What the document states of the step that answered, held by the first response part. */
  answerStates: Stated | undefined;
  /** Whether an agent step has answered the turn already. */
  answered: boolean;
}

/**
 * The turns a document's steps are read as.
 *
 * A step that follows an answered turn opens one of its own with no message, since ATIF
 * states one step per inference. What the document states of a step hangs on the first
 * part the reading produces for it.
 */
const turnsOf = (
  document: Document,
  cwd: string | undefined,
): Effect.Effect<ReadonlyArray<Turn>, PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    const turns: Turn[] = [];

    for (const step of document.steps) {
      const parts = yield* responsesOf(step, cwd);
      const states = statedOf(step);
      const open = step.source === "agent" ? turns.at(-1) : undefined;

      if (open !== undefined && !open.answered) {
        for (const part of parts) open.response.push(part);

        open.answered = true;

        if (parts.length > 0) open.answerStates = states;

        continue;
      }

      const answered = step.source === "agent";
      const onResponse = answered && parts.length > 0;

      const opened: StatedPrompt = answered
        ? { prompt: Prompt.empty, extra: {} }
        : yield* promptOf(step, cwd);

      turns.push({
        prompt: opened.prompt,
        promptExtra: opened.extra,
        promptStates: onResponse ? undefined : states,
        response: [...parts],
        answerStates: onResponse ? states : undefined,
        answered,
      });
    }

    return turns;
  });

/**
 * Produces the turns of a document, in the order the document states them.
 *
 * The session is declared before the parts produced in it, and forked from the main
 * session. What the document states of the run is declared with it, and what it states
 * of a step with the part of that step.
 */
export const produce = (
  main: Produce.ProduceSession<
    Tools,
    (typeof AtifEvent.eventkit)["events"],
    (typeof extrakit)["extra"]
  >,
  document: Document,
  cwd: string | undefined,
): Effect.Effect<void, TrajectoryError | PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    const session = yield* main.forkSession({
      id: sessionIdOf(document),
      [documentExtra.tag]: documentFields(document),
    });

    for (const turn of yield* turnsOf(document, cwd)) {
      yield* session.enqueuePrompt(turn.prompt, {
        ...turn.promptExtra,
        ...extraOf(turn.promptStates),
        timestamp: turn.promptStates?.moment,
      });

      for (const [at, produced] of turn.response.entries()) {
        const states = at === 0 ? turn.answerStates : undefined;

        yield* session.enqueueResponse(produced.part, {
          ...produced.extra,
          ...extraOf(states),
          timestamp: states?.moment,
        });
      }
    }
  });
