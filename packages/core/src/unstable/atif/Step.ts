/**
 * Text-oriented ATIF step views over one session.
 *
 * {@link steps} converts conversation steps into {@link Step} values.
 * These values are not complete ATIF document records.
 *
 * @stability stable
 */

import { Match, Option, Stream } from "effect";
import type { Prompt, Tool } from "effect/ai";

import * as Config from "#/Config.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import * as View from "#/view/index.ts";

/**
 * The contributor role used by ATIF step views.
 *
 * **Details**
 *
 * Assistant prompt messages map to `"agent"` and tool prompt messages map to `"user"`.
 *
 * @see {@link Step} for the view fields.
 * @stability stable
 * @category models
 */
export type StepSource = "system" | "user" | "agent";

/**
 * A text-oriented message or agent turn without ATIF document metadata.
 *
 * **Details**
 *
 * Prompt-message views have no reasoning, calls, or observations, even for assistant messages.
 * Response-group views carry concatenated text and reasoning, tool calls, and tool results.
 * `observations` omits ATIF's enclosing observation object.
 *
 * @see {@link steps} for conversion and omitted fields.
 * @stability stable
 * @category models
 */
export type Step<Tools extends Record<string, Tool.Any>> = Readonly<{
  source: StepSource;
  message: string;
  reasoning: Option.Option<string>;
  toolCalls: ReadonlyArray<Response.ToolCallPartsView<Tools>>;
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
): ReadonlyArray<Step<Tools<Config>>> =>
  Match.value(step).pipe(
    Match.tag("Prompt", (prompt) =>
      prompt.prompt.messages.map((message) => ({
        source: sources[message.role],
        message: messageOf(message),
        reasoning: Option.none(),
        toolCalls: [],
        observations: [],
      })),
    ),
    Match.tag("Response", ({ response: parts }): ReadonlyArray<Step<Tools<Config>>> => {
      // A run that produced nothing answers with no step of its own.
      if (parts.length === 0) return [];

      let message = "";
      let reasoning = "";
      const toolCalls: Response.ToolCallPartsView<Tools<Config>>[] = [];
      const observations: Response.ToolResultPartsView<Tools<Config>>[] = [];

      for (const part of parts) {
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
    }),
    // An event states nothing of the conversation.
    Match.tag("Event", () => []),
    Match.exhaustive,
  );

/**
 * Converts one session into unnumbered, text-oriented ATIF step views.
 *
 * **Details**
 *
 * Each prompt message becomes one step.
 * Each response group becomes one agent step.
 * Events produce no steps.
 * Response grouping follows {@link View.steps}.
 *
 * **Gotchas**
 *
 * Media content, timestamps, extras, metric results, and step ids are not carried into the view.
 * Tool-result content inside prompt messages contributes no text.
 * The result cannot reconstruct a complete original ATIF document.
 *
 * @see {@link Step} for the output fields.
 * @stability stable
 * @category converting
 */
export const steps = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<Step<Tools<Config>>, E | TrajectoryError, R> =>
  View.steps(stream).pipe(Stream.flatMap((step) => Stream.fromIterable(stepsOf(step))));
