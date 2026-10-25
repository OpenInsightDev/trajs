/**
 * A trajectory read as the steps ATIF exchanges.
 *
 * {@link steps} reads a session's steps on ATIF's terms, and {@link Step} says what a
 * step holds. What ATIF states of a step beyond what it says is extra data this module
 * carries, which the reading does not fold back into a step yet.
 */

import { Option, Stream } from "effect";
import type { Prompt, Tool } from "effect/ai";

import * as Config from "#/Config.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import * as View from "#/View.ts";

/**
 * Who contributed a step: the system prompt a model was given, the user, or the agent
 * that answered them.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject", the values of its `source`.
 *
 * @category models
 */
export type StepSource = "system" | "user" | "agent";

/**
 * One step of a trajectory: a message a model was given, or the turn the model
 * answered it with.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject", of which a step here states what a
 * trajectory holds. `reasoning`, `toolCalls` and `observations` are empty on a step of a
 * source other than the agent.
 *
 * @category models
 */
export type Step<Tools extends Record<string, Tool.Any>> = Readonly<{
  /** Who contributed the step. */
  source: StepSource;
  /**
   * The dialogue of the step.
   *
   * TODO: read the content parts of a message, which ATIF added in v1.6.
   */
  message: string;
  /** What the agent thought, where it is an agent step that thought. */
  reasoning: Option.Option<string>;
  /** The tools the step called, where it is an agent step that called any. */
  toolCalls: ReadonlyArray<Response.ToolCallPartsView<Tools>>;
  /**
   * The results those calls were answered with.
   *
   * ATIF wraps them in an `observation` object; the wrapper is dropped here.
   */
  observations: ReadonlyArray<Response.ToolResultPartsView<Tools>>;
}>;

/** The tools of a trajectory's toolkit, which the steps read from it are typed by. */
type Tools<Config extends Config.AnyConfig> = Config["toolkit"]["tools"];

const sources: Record<Prompt.Message["role"], StepSource> = {
  system: "system",
  user: "user",
  // An assistant message is context the agent produced, so it is the agent's side.
  assistant: "agent",
  // A tool message is environment feedback, which ATIF reads as the user's side.
  tool: "user",
};

/**
 * The text of the parts given.
 *
 * TODO: a tool result carries no text, so a tool message says nothing.
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

/** The steps one step of a session is read as. */
const stepsOf = <Config extends Config.AnyConfig>(
  step: View.Step<Config>,
): ReadonlyArray<Step<Tools<Config>>> => {
  switch (step._tag) {
    case "Prompt":
      return step.prompt.messages.map((message) => ({
        source: sources[message.role],
        message: messageOf(message),
        reasoning: Option.none(),
        toolCalls: [],
        observations: [],
      }));

    case "Response": {
      // A run that produced nothing answers with no step of its own.
      if (step.response.length === 0) return [];

      let message = "";
      let reasoning = "";
      const toolCalls: Response.ToolCallPartsView<Tools<Config>>[] = [];
      const observations: Response.ToolResultPartsView<Tools<Config>>[] = [];

      for (const part of step.response) {
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

      return [
        {
          source: "agent",
          message,
          reasoning: reasoning === "" ? Option.none() : Option.some(reasoning),
          toolCalls,
          observations,
        },
      ];
    }

    case "Event":
      return [];
  }
};

/**
 * Reads the parts of a session as the steps they are made of.
 *
 * A `Prompt` is read as one step per message, a `Response` as one agent step for the
 * parts it holds, and an `Event` as no step. The steps are emitted in order and
 * unnumbered, since ATIF numbers them by their position in the document.
 *
 * @category combinators
 */
export const steps = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<Step<Tools<Config>>, E | TrajectoryError, R> =>
  View.steps(stream).pipe(Stream.flatMap((step) => Stream.fromIterable(stepsOf(step))));
