/**
 * Reads a trajectory as the conversation a model ran on.
 *
 * A recording is a stream of parts in one total order: the messages a model was
 * given, the parts it returned, session declarations and extension data. That is
 * not the conversation itself. This module derives the conversation from it:
 * {@link promptTurns} groups the parts into turns — a prompt and the responses
 * produced for it — and {@link prompt} folds the turns back into the single
 * prompt the model was given.
 *
 * A turn is not attributed to a session, because parts are not. Select the
 * session to read before grouping a recording that interleaves several.
 */

import { Effect, Option, Predicate, Stream } from "effect";
import { Prompt, type Tool } from "effect/ai";
import type * as Extension from "#/Extension.ts";
import type * as Response from "#/Response.ts";
import type { Part, PartStream } from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A prompt together with the response parts produced for it.
 *
 * **When to use**
 *
 * Use when reading a trajectory turn by turn, such as to inspect what a model was
 * asked and what it answered.
 *
 * **Details**
 *
 * `prompt` holds the messages that were passed to the model, and `response` every
 * part the model returned for them. A recording that interleaves several sessions
 * keeps their parts in one sequence, so a turn is not attributed to a session:
 * select the session to read before grouping.
 *
 * @see {@link prompt} for folding the turns of a trajectory into one prompt.
 * @category models
 */
export type PromptTurn<Tools extends Record<string, Tool.Any>> = Readonly<{
  /**
   * The prompt of the turn.
   */
  prompt: Prompt.Prompt;
  /**
   * The response parts produced for the prompt.
   */
  response: Response.PartView<Tools>[];
}>;

/**
 * Groups the parts of a trajectory into turns.
 *
 * **When to use**
 *
 * Use when reading a recording turn by turn, such as to inspect what a model was
 * asked and what it answered, or to attribute a response to the prompt it
 * answered.
 *
 * **Details**
 *
 * A prompt part opens a turn and every response part that follows it until the
 * next prompt is recorded on it. Session parts are skipped, and so are response
 * parts that no prompt precedes, because they belong to no recorded prompt. A turn
 * is emitted once the next prompt is reached, so only the turn being assembled is
 * held, and the last one is emitted when the trajectory ends.
 *
 * Parts are not attributed to a session, so select the session to group out of a
 * recording that interleaves several.
 *
 * @see {@link PromptTurn} for the turns that are emitted.
 * @see {@link prompt} for folding the turns back into one prompt.
 * @category combinators
 */
export const promptTurns = <Tools extends Record<string, Tool.Any>, E, R>(
  trajectory: PartStream<Tools, Record<string, Extension.Any>, E, R>,
): Stream.Stream<PromptTurn<Tools>, E | TrajectoryError, R> =>
  // A turn is only known to be over once the next prompt is reached, so the
  // trajectory is closed with a marker that releases the turn still open.
  Stream.concat(
    trajectory.pipe(Stream.map((part) => Option.some(part))),
    Stream.make(Option.none<Part<Tools, Record<string, Extension.Any>>>()),
  ).pipe(
    Stream.mapAccum(
      (): Option.Option<PromptTurn<Tools>> => Option.none(),
      (assembling, part) => {
        if (Option.isNone(part)) {
          return [Option.none(), Option.toArray(assembling)] as const;
        }

        const value = part.value;

        if (Predicate.isTagged("Prompt")(value)) {
          const opened: PromptTurn<Tools> = {
            prompt: Prompt.fromMessages(value.messages),
            response: [],
          };

          return [Option.some(opened), Option.toArray(assembling)] as const;
        }

        // Appended in place: a turn holds every response recorded for it, and
        // copying the list on each part would make holding quadratic in its
        // length.
        if (Predicate.isTagged("Response")(value) && Option.isSome(assembling)) {
          assembling.value.response.push(value.response);
        }

        return [assembling, []] as const;
      },
    ),
  );

/**
 * Folds a trajectory back into the prompt its model was given.
 *
 * **When to use**
 *
 * Use to reconstruct the conversation a session ran on as one prompt, so it can
 * be continued, evaluated or inspected as a whole.
 *
 * **Details**
 *
 * Each prompt part is concatenated with the response parts recorded for it, so
 * the result is the messages of the whole trajectory rather than of one turn. A
 * prompt part opens a turn and the response parts that follow it belong to it;
 * session parts are skipped, and response parts that no prompt precedes are
 * dropped, because they belong to no recorded prompt.
 *
 * Parts are not attributed to a session, so select the session to fold out of a
 * recording that interleaves several: pipe it through `Session.of(id)` to read a
 * session together with what it inherited, or `Session.select(id)` for its own
 * parts.
 *
 * **Example** (Folding a recording back into its prompt)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Response, Trajectory, View } from "@trajs/core"
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(
 *     Trajectory.promptPart(Prompt.make("Hello")),
 *     Trajectory.responsePart(Response.makePart("text", { text: "Hi there" }))
 *   )
 * )
 *
 * const folded = await Effect.runPromise(View.prompt(trajectory))
 * folded.content.map((message) => message.role) // => ["user", "assistant"]
 * ```
 *
 * @see {@link promptTurns} for the turns the prompt is folded from.
 * @category combinators
 */
export const prompt = <Tools extends Record<string, Tool.Any>>(
  trajectory: PartStream<Tools, Record<string, Extension.Any>>,
): Effect.Effect<Prompt.Prompt, TrajectoryError> =>
  promptTurns(trajectory).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (curr, { prompt, response }) =>
        Prompt.concat(curr, Prompt.concat(prompt, Prompt.fromResponseParts(response))),
    ),
  );
