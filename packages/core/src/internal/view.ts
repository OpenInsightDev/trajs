/**
 * The reading behind {@link View.promptTurns}, {@link View.prompt},
 * {@link View.conversations} and {@link View.toolTurns}: one pass over the parts of a
 * session groups them into the turns they were produced in, folding the increments of a
 * streamed response into the parts they complete, and the turns are folded back into the
 * prompt its model was given — or, session by session, into the conversation each of them
 * ran in. A tool call is held by the id it is answered with, so the calls a session made
 * are read as the tool turns they are answered in.
 *
 * Nothing here is published: a program reaches the reading through those four.
 */

import { Effect, Option, Stream } from "effect";
import { Prompt } from "effect/ai";

import * as Config from "#/Config.ts";
import { collapse, initial, type State } from "#/internal/folding.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { PromptTurn, ToolTurn } from "#/View.ts";

/** The turn being assembled from the parts of a session read so far, and the folding of its responses. */
interface Assembly<Config extends Config.AnyConfig> {
  readonly turn: Option.Option<PromptTurn<Config>>;
  readonly folding: State;
}

const closed = <Config extends Config.AnyConfig>(): Assembly<Config> => ({
  turn: Option.none(),
  folding: initial(),
});

/** The turn a prompt opens: what a model was given, with nothing answered yet. */
const opened = <Config extends Config.AnyConfig>(
  prompt: Trajectory.PromptPart<Config["extrakit"]>,
): Assembly<Config> => ({ turn: Option.some({ prompt, response: [] }), folding: initial() });

const turnsOf = <Config extends Config.AnyConfig>(
  turn: Option.Option<PromptTurn<Config>>,
): ReadonlyArray<PromptTurn<Config>> => (Option.isSome(turn) ? [turn.value] : []);

const assemble = <Config extends Config.AnyConfig>(
  assembly: Assembly<Config>,
  part: Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
): readonly [Assembly<Config>, ReadonlyArray<PromptTurn<Config>>] => {
  switch (part._tag) {
    case "Prompt":
      // A prompt opens a turn and closes the one before it, whether or not that one
      // was answered, so the turns are emitted in the order they were produced in.
      return [opened(part), turnsOf(assembly.turn)];

    case "Response": {
      const open = assembly.turn;

      // A response is on the turn the prompt before it opened; one no prompt precedes is on no
      // turn, and is dropped. A part that states no session belongs to the main session, as one
      // stating `"main"` does.
      const session = part.sessionId ?? Trajectory.mainSessionId;

      if (
        Option.isNone(open) ||
        (open.value.prompt.sessionId ?? Trajectory.mainSessionId) !== session
      ) {
        return [assembly, []];
      }

      const [folding, folded] = collapse(assembly.folding, session, part.response);
      const response = [...open.value.response, ...folded];

      return [{ turn: Option.some({ prompt: open.value.prompt, response }), folding }, []];
    }

    default:
      return [assembly, []];
  }
};

/**
 * Reads the parts of a session as the turns its conversation was produced in: a prompt part
 * opens a turn, the response parts that follow it are folded into that turn, and a turn is
 * closed by the prompt after it, or by the parts ending.
 */
export const readTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(closed<Config>, assemble, {
      // The turn the parts end in has no prompt after it to close it, so the parts ending is
      // what closes it.
      onHalt: (assembly) => turnsOf(assembly.turn),
    }),
  );

/**
 * Folds the parts of a session back into the prompt its model was given: the turns they were
 * produced in, concatenated in the order they were produced.
 */
export const readPrompt = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E, R> =>
  readTurns(stream).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (folded, turn) =>
        folded.pipe(
          Prompt.concat(Prompt.fromMessages(turn.prompt.messages)),
          Prompt.concat(Prompt.fromResponseParts(turn.response)),
        ),
    ),
  );

/**
 * Reads the parts of a session as the tool turns they hold: a call is held by the id it carries
 * from where it is read to where the result that answers it arrives, and the two are emitted as
 * one turn there.
 */
export const readToolTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(
      () => new Map<string, Response.ToolCallPartsView<Config["toolkit"]["tools"]>>(),
      (calls, part) => {
        if (part._tag !== "Response") return [calls, []];

        const response = part.response;

        switch (response.type) {
          case "tool-call":
            calls.set(response.id, response);

            return [calls, []];
          case "tool-result": {
            if (response.preliminary) return [calls, []];

            const call = calls.get(response.id);

            if (call === undefined) return [calls, []];

            calls.delete(response.id);

            return [calls, [{ call, result: response }]];
          }

          default:
            return [calls, []];
        }
      },
    ),
  );
