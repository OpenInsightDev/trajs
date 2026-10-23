/**
 * A trajectory read as the steps ATIF exchanges.
 *
 * ATIF — the Agent Trajectory Interchange Format — carries an agent's run as one
 * ordered list of steps, each of them a system prompt, a user message or a
 * complete agent turn. This module derives that list from a trajectory:
 * {@link steps} groups the parts of a trajectory into the turns they were
 * produced as, with `View.promptTurns` of `@trajs/core`, and reads one step per
 * message of a turn and one more for the turn itself. {@link Step} says what a
 * step holds and {@link StepSource} who contributed one.
 *
 * A step holds what a trajectory holds of the turn it is read from, which is less
 * than ATIF's `StepObject` states: what the step says, and the parts it answered
 * with. What ATIF states of a step beyond that — the model that answered it, the
 * tokens and the cost of the turn, the ordinal of the step and the markers that tell
 * copied or deterministic steps apart — is extra data this package carries on the
 * part of the step — see `Extras` — which this reading does not fold back into a
 * step yet. {@link Step} says of each field what ATIF states and what a step holds,
 * so that what is left to whoever writes the document is read off it.
 */

import { View } from "@trajs/core";
import type { Response } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import type * as Session from "@trajs/core/Session";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Option, Stream } from "effect";
import type { Prompt, Tool } from "effect/ai";

/**
 * Who contributed a step: the system prompt a model was given, the user, or the
 * agent that answered them.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject", the values of its `source`.
 *
 * **When to use**
 *
 * Use when a step is read by who contributed it rather than by what it holds.
 *
 * **Details**
 *
 * The values are ATIF's own, and they are the `source` of a `StepObject`. A
 * message a model was given contributes the side of the conversation its role
 * names, so an assistant message a prompt carries is the agent's side and a tool
 * message — environment feedback delivered as a message — the user's.
 *
 * @see {@link Step} for the steps a trajectory is read as.
 * @category models
 */
export type StepSource = "system" | "user" | "agent";

/**
 * One step of a trajectory: a message a model was given, or the turn the model
 * answered it with.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject", of which a step here states what
 * a trajectory holds.
 *
 * **When to use**
 *
 * Use when a trajectory is to be read or carried step by step — one message or one
 * turn at a time — such as to display it, to score it, or to hand it to the
 * ATIF document a program exchanges trajectories in.
 *
 * **Details**
 *
 * A step is the unit ATIF exchanges a trajectory in: a system prompt, a user
 * message, or one complete agent turn — the inference that answered the messages
 * before it together with the tools it called and the results those calls were
 * answered with. `source` says which of the three a step is, and the rest of the
 * step says what it contributed. `message` is the dialogue of the step: what a
 * message a model was given said, or the text a model answered with. The
 * remaining fields are the agent's own and are empty on a step of any other
 * source: `reasoning` is what the agent thought, `toolCalls` the tools it called,
 * and `observations` the results those calls were answered with, each result
 * naming the call it answers by the same id the call carries.
 *
 * What the steps are read from are the turns of `View.promptTurns`, so a step
 * reads the conversation rather than the increments a streamed response arrived
 * in.
 *
 * A step carries what a trajectory holds of the turn it is read from. What ATIF
 * states of a step beyond that — a model's name, the tokens or the cost of a turn,
 * a step's ordinal position and the markers that tell copied or deterministic steps
 * apart — is carried as extra data on the part of the step, which this reading does
 * not fold back into a step yet.
 *
 * @see {@link steps} for the steps a trajectory is read as.
 * @see {@link StepSource} for who contributed one.
 * @category models
 */
export type Step<Tools extends Record<string, Tool.Any>> = Readonly<{
  /** Who contributed the step. */
  source: StepSource;
  /**
   * The dialogue of the step: what was said.
   *
   * TODO: read the content parts of a message, which ATIF added in v1.6. A part
   * that is not text carries no path a `ContentPart` could name, and a
   * trajectory holds its bytes instead, so the parts a step cannot state are not
   * stated rather than being written out as references nothing resolves.
   */
  message: string;
  /** What the agent thought, where it is an agent step that thought. */
  reasoning: Option.Option<string>;
  /** The tools the step called, where it is an agent step that called any. */
  toolCalls: ReadonlyArray<Response.ToolCallPartsView<Tools>>;
  /**
   * The results those calls were answered with.
   *
   * Deviation: ATIF wraps them in an `observation` object whose only field is
   * the results, so the wrapper is dropped here.
   */
  observations: ReadonlyArray<Response.ToolResultPartsView<Tools>>;
}>;

/** The tools of a trajectory's toolkit, which the steps read from it are typed by. */
type Tools<Config extends Config.AnyConfig> = Config["toolkit"]["tools"];

const sources: Record<Prompt.Message["role"], StepSource> = {
  system: "system",
  user: "user",
  // An assistant message a prompt carries is context the agent produced, so it
  // is the agent's side of the conversation.
  assistant: "agent",
  // A tool message is environment feedback delivered as a message, which ATIF
  // reads as the user's side of the conversation.
  tool: "user",
};

/**
 * The text of the parts given, which is what a step says of them.
 *
 * TODO: a tool result carries no text, so a tool message says nothing; reading
 * it means reading the result of its parts, which may not be a string.
 */
const textOf = (parts: ReadonlyArray<Prompt.Part>): string => {
  let text = "";

  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }

  return text;
};

/** The dialogue of a message a model was given. */
const messageOf = (message: Prompt.Message): string =>
  message.role === "system" ? message.content : textOf(message.content);

/** The steps one turn is read as. */
const stepsOf = <Config extends Config.AnyConfig>(
  turn: View.PromptTurn<Config>,
): ReadonlyArray<Step<Tools<Config>>> => {
  const steps: Step<Tools<Config>>[] = turn.prompt.messages.map((message) => ({
    source: sources[message.role],
    message: messageOf(message),
    reasoning: Option.none(),
    toolCalls: [],
    observations: [],
  }));

  // A turn that produced nothing answers its messages with no step of its own.
  if (turn.response.length === 0) return steps;

  let message = "";
  let reasoning = "";
  const toolCalls: Response.ToolCallPartsView<Tools<Config>>[] = [];
  const observations: Response.ToolResultPartsView<Tools<Config>>[] = [];

  for (const part of turn.response) {
    switch (part.type) {
      case "text":
        message += part.text;
        break;
      case "reasoning":
        reasoning += part.text;
        break;
      case "tool-call":
        toolCalls.push(part);
        break;
      case "tool-result":
        observations.push(part);
        break;
      default:
        break;
    }
  }

  steps.push({
    source: "agent",
    message,
    reasoning: reasoning === "" ? Option.none() : Option.some(reasoning),
    toolCalls,
    observations,
  });

  return steps;
};

/**
 * Reads the parts of a session as the steps they are made of.
 *
 * **When to use**
 *
 * Use when a session is to be read or carried step by step — one message or one turn
 * at a time — such as to display it, to score it, or to hand it to a program that reads
 * a trajectory as its steps, such as the results viewer of the Harbor framework, which
 * displays the steps of an ATIF document.
 *
 * **Details**
 *
 * - What it reads is the parts of one session ({@link Session.SessionStream}), which
 *   `Session.toSessions` reads of a trajectory: the steps of a document are the steps
 *   of one run, so a trajectory of several sessions is read one session at a time.
 * - One turn is read as a step for each message of its prompt, followed by one `agent`
 *   step for the parts the turn produced — where it produced any — so the steps are in
 *   the order the conversation was produced in: the system prompt and the user message
 *   a model was given, then the turn that answered them.
 * - A step is derived from a turn, so it inherits how a turn is read: the increments of
 *   a streamed response are folded into the parts they complete, a prompt part with no
 *   response reads as its messages alone, and a response part that no prompt precedes
 *   belongs to no turn and is dropped.
 *
 * ATIF numbers the steps of a document from `1` and requires the numbers to stay
 * sequential; what is read here holds no such number, so the steps are emitted in order
 * and unnumbered, and whoever writes the document numbers them by their position.
 *
 * The stream fails with what reading the parts fails with — `E` — and requires the
 * services `R` names.
 *
 * **Example** (Reading the parts of a session as its steps)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Session, Trajectory } from "@trajs/core"
 * import { Step } from "@trajs/extension-atif"
 *
 * const part = Trajectory.parts(Config.anyConfig)
 *
 * // What the main session's model was given, and what it returned for it as one whole
 * // part: a part that states no session belongs to the main session.
 * const trajectory = Trajectory.make(Config.anyConfig)(
 *   Stream.make(
 *     part.mainSession(),
 *     part.prompt(Prompt.make("What is 2 + 2?")),
 *     part.response(Response.makePart("text", { text: "4" }))
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 *
 * // The main session is the one session a reading holds first.
 * const [session] = sessions
 *
 * const steps = await Effect.runPromise(Stream.runCollect(Step.steps(session.stream)))
 *
 * Array.from(steps).map((step) => step.source) // => ["user", "agent"]
 * ```
 *
 * @see {@link Step} — the steps that are emitted.
 * @see {@link View.promptTurns} — the turns they are read from.
 * @see {@link Session.Session.stream} — the parts a session is read by.
 * @category combinators
 */
export const steps = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<Step<Tools<Config>>, E | TrajectoryError, R> =>
  View.promptTurns(stream).pipe(Stream.flatMap((turn) => Stream.fromIterable(stepsOf(turn))));
