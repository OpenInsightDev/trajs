/**
 * An ATIF document read as the turns of a trajectory.
 *
 * A document states one step per inference, while a trajectory holds what a model was
 * given before each of them, so the steps are read as turns: a step that states a
 * message opens a turn with it, an agent step is produced as the parts of the
 * response it answered with, and a step that follows the answer of a turn opens one
 * of its own with no message in it, because the model was called again on the same
 * messages. {@link produce} enqueues those turns into the producer of a trajectory,
 * carrying what the document states of a step beyond what it says — {@link StepFields}
 * — and what it states of the run itself — {@link DocumentFields} — as the extra data
 * the part it belongs to holds, and the moment a step happened as the `timestamp` of
 * that part.
 *
 * The reading names the toolkit a document declares — the tools it states its agent was
 * given, {@link toolkitOf} — and the extra data this package carries, and no other kit.
 * What a step holds beyond its text is read as far as a trajectory holds it: an image or
 * a recording is stated by a path, which the reading follows for the bytes — through the
 * file system it runs on, under the directory it is given — and produces as a `file` part
 * of the step, while the trajectory of a delegated subagent is another document, which is
 * no part of a trajectory and is left out rather than invented.
 */

import { Produce, Prompt, Response } from "@trajs/core";
import type { Extra, Trajectory } from "@trajs/core";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { DateTime, Effect, FileSystem, Option, Path, Predicate, Schema } from "effect";
import type { PlatformError } from "effect";

import type { Content, Document, StepObject } from "#/Document.ts";
import { DocumentFields, documentExtra, extrakit, StepFields, stepExtra } from "#/Extras.ts";
import type { Tools } from "#/internal/toolkit.ts";

/** What the reading reads a document with: the files it serves, and the paths it names. */
type Services = FileSystem.FileSystem | Path.Path;

/**
 * The session a document's steps are produced in, where the document names none.
 *
 * ATIF states the run a document belongs to for the document as a whole — the
 * steps of a document are the turns of one run — and `session_id` is optional since
 * ATIF v1.7, while a trajectory names every part by the session that produced it. A
 * document that states neither a run nor an identity of its own is therefore
 * produced in this session: a name of the reading's own rather than one of the
 * document's, and one a caller reading the trajectory can tell from a run that was
 * named.
 */
const unnamedSession = "atif";

const sessionIdOf = (document: Document): string =>
  document.session_id ?? document.trajectory_id ?? unnamedSession;

/**
 * What a document states of the run itself, which the session part of a trajectory
 * holds as the extra data of {@link DocumentFields}.
 *
 * A document states the version of the format it conforms to and the agent that ran,
 * and may state the identity of the document among the ones of its run, what a
 * producer wrote of the run, and the tokens and cost of the run as a whole. The tools
 * an agent was given are not among them: a toolkit is the kit a trajectory is read
 * with rather than a field of a document, which `toolkitOf` builds of the document.
 */
const documentFields = (document: Document): DocumentFields =>
  DocumentFields.make({
    version: DocumentFields.fields.version.literal,
    schema_version: document.schema_version,
    agent: {
      name: document.agent.name,
      version: document.agent.version,
      model_name: document.agent.model_name,
      extra: document.agent.extra,
    },
    trajectory_id: document.trajectory_id,
    notes: document.notes,
    final_metrics: document.final_metrics,
    extra: document.extra,
  });

/**
 * What a document states of one step beyond what it says, which the part of that step
 * holds as the extra data of {@link StepFields}.
 *
 * A step states the ordinal ATIF numbers it by, and may state the model that answered
 * it, the effort it took, how many inferences it stands for, what it cost, and what a
 * producer wrote of it beyond the format. Whether a step repeats an earlier trajectory
 * is not among them: a copied step belongs to the session the fork continues from,
 * which the reading does not rebuild yet.
 */
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

/**
 * The moment a document times a step at, where it states one that reads: ATIF times a
 * step with an ISO 8601 string, which times the part of the step with the moment the
 * record gives rather than with the moment the reading happened. A step that states no
 * moment, or one the format does not read as a moment, times no part.
 */
const momentOf = (step: StepObject): DateTime.Utc | undefined =>
  step.timestamp === undefined || step.timestamp === null
    ? undefined
    : Option.getOrUndefined(
        Schema.decodeUnknownOption(Schema.DateTimeUtcFromString)(step.timestamp),
      );

/**
 * What a document states of one step: the fields of the step, and the moment it
 * happened where the document times it at one.
 */
interface Stated {
  readonly fields: StepFields;
  readonly moment: DateTime.Utc | undefined;
}

/** What a document states of a step, read from the step. */
const statedOf = (step: StepObject): Stated => ({
  fields: stepFields(step),
  moment: momentOf(step),
});

/**
 * What the part of a step holds of it: the fields the document states of the step,
 * under the tag this package carries them by, and nothing where it states none. The
 * same fields are declared of a prompt part and of a response part, so what this
 * returns holds either.
 */
const extraOf = (
  states: Stated | undefined,
): Extra.ExtraRecord<(typeof extrakit)["extra"], "prompt"> =>
  states === undefined ? {} : { [stepExtra.tag]: states.fields };

/**
 * What a message or a result states, as the pieces the reading produces of it: the
 * text it says, or the bytes of an image or a recording.
 *
 * ATIF states a text part and a media part alike, while a trajectory holds the file
 * part a path names as the bytes themselves, so a piece is what the reading carries
 * of one — and a run of text parts is one piece, since what a trajectory states is
 * what was said rather than how the producer split it up.
 */
type Piece =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "file"; readonly mediaType: string; readonly data: Uint8Array };

/**
 * The path a piece is read from: the one the document states, where it is absolute or
 * the reading was given no directory, and the one it makes under that directory where
 * it is relative.
 */
const pathOf = (stated: string, cwd: string | undefined, paths: Path.Path): string =>
  cwd === undefined || paths.isAbsolute(stated) ? stated : paths.join(cwd, stated);

/**
 * The pieces a content states, in the order it states them.
 *
 * The bytes of an image or a recording are read through the file system the reading
 * runs on, from the path the document states them at under the directory the reading
 * was given, so what cannot be read there fails the reading with the failure of
 * reading it.
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
      });
    }

    if (text !== "") pieces.push({ kind: "text", text });

    return pieces;
  });

/** The text of the pieces given, which is what they say of the step they are of. */
const textOf = (pieces: ReadonlyArray<Piece>): string => {
  let text = "";

  for (const piece of pieces) {
    if (piece.kind === "text") text += piece.text;
  }

  return text;
};

/**
 * The text a content states, read without the media it holds: what a system message
 * is stated as, since a system message is text alone.
 */
const textOfContent = (content: Content): string => {
  if (Predicate.isString(content)) return content;

  let text = "";

  for (const part of content) {
    if (part.type === "text") text += part.text;
  }

  return text;
};

/**
 * The turn a step opens: what a model was given, as the one message the step states.
 *
 * A `system` step is a system message, which a trajectory states as text alone, so
 * an image or a recording of one is not read — and every other step is the user's
 * side of the conversation, whose message holds the parts of what it states: its
 * text, and an image or a recording as the bytes it names.
 */
const promptOf = (
  step: StepObject,
  cwd: string | undefined,
): Effect.Effect<Prompt.Prompt, PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    if (step.source === "system") {
      return Prompt.fromMessages([
        Prompt.makeMessage("system", { content: textOfContent(step.message) }),
      ]);
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

    return Prompt.fromMessages([Prompt.makeMessage("user", { content })]);
  });

/**
 * The id a result that answers no call is produced under: the step that was answered
 * and the position of the result in it, which name it without colliding with the id
 * of any call.
 */
const resultId = (step: StepObject, at: number): string => `${step.step_id}-${at + 1}`;

/**
 * The results a step was answered with, as the tool results of a trajectory, each
 * followed by the images and recordings it holds.
 *
 * A result that names no call answers the first call of its step that no result has
 * answered yet, since the calls of a step are answered in the order they were made; a
 * result beyond those calls is one of an action, which ATIF states without a tool. A
 * result that states nothing — no call, no text and no bytes — says nothing of the
 * conversation a trajectory holds, and is not produced.
 *
 * What a result says is its `result`, which a tool result states as a value rather
 * than as the parts of a message, so an image or a recording a result holds is
 * produced after it as a `file` part of its own rather than as a part of the
 * result.
 */
const resultsOf = (
  step: StepObject,
  cwd: string | undefined,
): Effect.Effect<ReadonlyArray<Response.AllPartsView<{}>>, PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    const calls = step.tool_calls ?? [];
    const answered = new Set<string>();
    const parts: Response.AllPartsView<{}>[] = [];

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

      for (const file of files) {
        parts.push(Response.makePart("file", { mediaType: file.mediaType, data: file.data }));
      }
    }

    return parts;
  });

/**
 * The parts a model returned for one step, in the order it returned them.
 *
 * A step of another source returns nothing: what it states is a message a model was
 * given rather than an answer, which is the prompt of its turn.
 */
const responsesOf = (
  step: StepObject,
  cwd: string | undefined,
): Effect.Effect<ReadonlyArray<Response.AllPartsView<{}>>, PlatformError.PlatformError, Services> =>
  Effect.gen(function* () {
    if (step.source !== "agent") return [];

    const parts: Response.AllPartsView<{}>[] = [];

    const reasoning = step.reasoning_content ?? "";

    if (reasoning !== "") parts.push(Response.makePart("reasoning", { text: reasoning }));

    for (const piece of yield* piecesOf(step.message, cwd)) {
      if (piece.kind === "text") {
        if (piece.text !== "") parts.push(Response.makePart("text", { text: piece.text }));

        continue;
      }

      parts.push(Response.makePart("file", { mediaType: piece.mediaType, data: piece.data }));
    }

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

    for (const result of yield* resultsOf(step, cwd)) parts.push(result);

    return parts;
  });

/** One turn as {@link turnsOf} builds it, before it is produced. */
interface Turn {
  prompt: Prompt.Prompt;
  /**
   * What the document states of the step that stated the prompt, which the prompt part
   * of the turn holds.
   */
  promptStates: Stated | undefined;
  response: Array<Response.AllPartsView<{}>>;
  /**
   * What the document states of the step that answered the turn, which the first part
   * of the response holds — the step being one account of one answer.
   */
  answerStates: Stated | undefined;
  /** Whether an agent step has answered the turn already. */
  answered: boolean;
}

/**
 * The turns a document's steps are read as.
 *
 * A step that answers a turn an agent step has answered already opens one of its own,
 * since ATIF states one step per inference while a trajectory holds what a model was
 * given before each of them: the model was called again on the same messages with the
 * results of the calls in between, which are the parts produced before it — so the
 * turn opens with no message of its own rather than repeating what the model was given.
 *
 * What the document states of a step hangs on the first part the reading produces for
 * it: the prompt part of a step that states a message, the first response part of a
 * step that answered with parts, and the prompt part of a turn an agent step opened
 * with nothing to answer with, which is the part the reading produced for that step. A
 * step that answered an open turn with nothing has no part of its own, so what the
 * document states of it is left out.
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

      turns.push({
        prompt: answered ? Prompt.empty : yield* promptOf(step, cwd),
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
 * The session is declared before the parts produced in it, since every part of a
 * trajectory names the session that produced it and a document states one run rather
 * than a session per step. It is forked from the main session where that session was
 * declared — the point the trajectory starts at, so it continues from nothing — and
 * what the document states of the run is declared with it, while what it states of a
 * step is declared with the part of that step.
 *
 * What a step holds beside its text is read as the step is produced — the bytes of an
 * image at the path the document states, under the directory the reading is given — so
 * the reading needs the file system and the paths of the program it is run in, and
 * fails with what that file system fails with.
 */
export const produce = (
  main: Produce.ProduceSession<
    Tools,
    Trajectory.UnknownConfig["eventkit"]["events"],
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
      yield* session.enqueuePrompt(
        turn.prompt,
        extraOf(turn.promptStates),
        turn.promptStates?.moment,
      );

      for (const [at, part] of turn.response.entries()) {
        const states = at === 0 ? turn.answerStates : undefined;

        yield* session.enqueueResponse(part, extraOf(states), states?.moment);
      }
    }
  });
