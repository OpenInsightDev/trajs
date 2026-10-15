/**
 * The reading behind {@link View.promptTurns} and {@link View.prompt}: one pass over
 * a trajectory groups its parts into the turns they were recorded in, folding the
 * increments of a streamed response into the parts they complete, and the turns are
 * folded back into the prompt one session's model was given.
 *
 * Nothing here is published: a program reaches the reading through
 * `View.promptTurns` and `View.prompt`.
 */

import { Effect, Option, Stream } from "effect";
import { Prompt } from "effect/ai";

import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";
import type { PromptTurn } from "#/View.ts";

import { collapse, initial, type State } from "./folding.ts";

/** The turn being assembled from the parts read so far, and the folding of its responses. */
interface Assembly<Config extends Trajectory.AnyConfig> {
  readonly turn: Option.Option<PromptTurn<Config>>;
  readonly folding: State;
}

const closed = <Config extends Trajectory.AnyConfig>(): Assembly<Config> => ({
  turn: Option.none(),
  folding: initial(),
});

/** The turn a prompt opens: what a model was given, with nothing answered yet. */
const opened = <Config extends Trajectory.AnyConfig>(
  prompt: Trajectory.PromptPart<Config["extrakit"]>,
): Assembly<Config> => ({ turn: Option.some({ prompt, response: [] }), folding: initial() });

const turnsOf = <Config extends Trajectory.AnyConfig>(
  turn: Option.Option<PromptTurn<Config>>,
): ReadonlyArray<PromptTurn<Config>> => (Option.isSome(turn) ? [turn.value] : []);

const assemble = <Config extends Trajectory.AnyConfig>(
  assembly: Assembly<Config>,
  part: Trajectory.Part<Config>,
): readonly [Assembly<Config>, ReadonlyArray<PromptTurn<Config>>] => {
  switch (part._tag) {
    case "Prompt":
      // A prompt opens a turn and closes the one before it, whether or not that one
      // was answered, so the turns are emitted in the order they were recorded in.
      return [opened(part), turnsOf(assembly.turn)];

    case "Response": {
      const open = assembly.turn;

      // A response the open turn is not the prompt of — one no prompt precedes, or
      // one of another session — is on no turn of this reading.
      if (Option.isNone(open) || open.value.prompt.sessionId !== part.sessionId) {
        return [assembly, []];
      }

      const [folding, folded] = collapse(assembly.folding, part.sessionId, part.response);
      const response = [...open.value.response, ...folded];

      return [{ turn: Option.some({ prompt: open.value.prompt, response }), folding }, []];
    }

    default:
      return [assembly, []];
  }
};

/**
 * A trajectory read as the parts of one session alone: it fails where it declares
 * a session after a part of the session the trajectory reads.
 *
 * A session is declared before the parts it recorded, so the declarations a
 * trajectory opens with are the ones it makes before recording anything; a
 * declaration read after a part is the declaration of another session, or of one
 * declared twice, so the stream holds the parts of more than one session — which is
 * what {@link readPrompt} refuses to fold.
 */
const oneSession = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<Trajectory.Part<Config>, E | TrajectoryError, R> =>
  Stream.suspend(() => {
    // A reading of the stream starts afresh, so whether a part has been read is
    // held per reading rather than by the combinator.
    let recording = false;

    const check = (part: Trajectory.Part<Config>): Effect.Effect<void, TrajectoryError> => {
      if (part._tag !== "Session") {
        recording = true;

        return Effect.void;
      }

      return recording
        ? Effect.fail(TrajectoryError.session(part.id, "several-sessions"))
        : Effect.void;
    };

    return trajectory.pipe(Stream.tap(check));
  });

/**
 * Reads a trajectory as the turns its conversation was recorded in: a prompt part
 * opens a turn, the response parts that follow it are folded into that turn, and a
 * turn is closed by the prompt after it, or by the trajectory ending.
 */
export const readTurns = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> =>
  trajectory.pipe(
    Stream.mapAccum(closed<Config>, assemble, {
      // The turn a recording ends in has no prompt after it to close it, so the
      // recording ending is what closes it.
      onHalt: (assembly) => turnsOf(assembly.turn),
    }),
  );

/**
 * Folds a trajectory back into the prompt its model was given, from the parts of one
 * session alone: a trajectory that declares a session after the parts of another one
 * fails with the {@link TrajectoryError} that names it rather than folding the prompt
 * of both.
 */
export const readPrompt = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E | TrajectoryError, R> =>
  readTurns(oneSession(trajectory)).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (folded, turn) =>
        Prompt.concat(
          folded,
          Prompt.concat(
            Prompt.fromMessages(turn.prompt.messages),
            Prompt.fromResponseParts(turn.response),
          ),
        ),
    ),
  );
