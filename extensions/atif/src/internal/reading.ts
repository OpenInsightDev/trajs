/**
 * An ATIF document read as the turns of a trajectory.
 *
 * A document states one step per inference, while a trajectory holds what a model was
 * given before each of them, so the steps are read as turns: a step that states a
 * message opens a turn with it, an agent step is produced as the parts of the
 * response it answered with, and a step that follows the answer of a turn opens one
 * of its own with no message in it, because the model was called again on the same
 * messages. {@link produce} enqueues those turns into the producer of a trajectory.
 *
 * The reading is written against the kits a document names, which are none — the
 * empty kits of {@link Trajectory.UnknownConfig} — so a part a step holds beyond its
 * text — an image, a trajectory of speech, a subagent trajectory — is stated by a
 * location or by another document, and neither is a part a trajectory holds: what is
 * not read of a document is left out rather than invented.
 */

import { Produce, Prompt, Response } from "@trajs/core";
import type { Trajectory } from "@trajs/core";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect, Predicate } from "effect";

import type { Content, Document, StepObject } from "#/Document.ts";

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
 * The text of what a message says or a result answered with: a string as it is, and
 * the parts of one as the text of the parts that are text.
 *
 * A part that is not text carries none, so it says nothing of the message it is part
 * of — see {@link Content}.
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
 * The id a result that answers no call is produced under: the step that was answered
 * and the position of the result in it, which name it without colliding with the id
 * of any call.
 */
const resultId = (step: StepObject, at: number): string => `${step.step_id}-${at + 1}`;

/**
 * The results a step was answered with, as the tool results of a trajectory.
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

/** One turn as {@link turnsOf} builds it, before it is produced. */
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
 * since ATIF states one step per inference while a trajectory holds what a model was
 * given before each of them: the model was called again on the same messages with the
 * results of the calls in between, which are the parts produced before it — so the
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

/**
 * Produces the turns of a document, in the order the document states them.
 *
 * The session is declared before the parts produced in it, since every part of a
 * trajectory names the session that produced it and a document states one run rather
 * than a session per step.
 */
export const produce = (
  producer: Produce.Producer<
    Trajectory.UnknownConfig["toolkit"]["tools"],
    Trajectory.UnknownConfig["eventkit"]["events"],
    Trajectory.UnknownConfig["extrakit"]["extra"]
  >,
  document: Document,
): Effect.Effect<void, TrajectoryError> =>
  Effect.gen(function* () {
    const session = yield* producer.createSession({ id: sessionIdOf(document) });

    for (const turn of turnsOf(document)) {
      yield* session.enqueuePrompt(turn.prompt);

      for (const part of turn.response) yield* session.enqueueResponse(part);
    }
  });
