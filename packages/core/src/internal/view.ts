/**
 * The assembly state {@link View.promptTurns} folds the parts of a session through: the
 * turn being assembled and the fold of its streamed responses. The grouping itself is
 * stated by the readers.
 *
 * Nothing here is published: a program reaches the reading through {@link View}.
 */

import { Option } from "effect";

import { initial, type State } from "#/internal/folding.ts";

/** The turn being assembled from the parts read so far, and the folding of its responses. */
export interface Assembly<Turn> {
  readonly turn: Option.Option<Turn>;
  readonly folding: State;
}

/** The assembly a reading starts from: no turn open. */
export const closed = <Turn>(): Assembly<Turn> => ({
  turn: Option.none(),
  folding: initial(),
});

/** The assembly a turn opens: the turn given, with nothing folded into it yet. */
export const opened = <Turn>(turn: Turn): Assembly<Turn> => ({
  turn: Option.some(turn),
  folding: initial(),
});

/** The turn an assembly holds, where it holds one. */
export const turnsOf = <Turn>(assembly: Assembly<Turn>): ReadonlyArray<Turn> =>
  Option.isSome(assembly.turn) ? [assembly.turn.value] : [];
