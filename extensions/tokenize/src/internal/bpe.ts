/**
 * The byte-pair merge of one piece of text.
 *
 * A piece is the run of text a pattern yields, and merging it is the hot path of
 * encoding, so it is pure and synchronous: it reads the rank tables of an
 * encoding and returns the tokens of that piece, and the caller decides what to
 * memoize around it.
 */

import { tryBytesToText } from "#/internal/text.ts";

/** The rank standing for "no token holds this byte slice". */
export const NO_RANK = 0xffffffff;

/** A byte slice together with the rank of the token that holds it. */
export type RankedBytes = readonly [Uint8Array, number];

/**
 * The rank tables a piece is merged against.
 *
 * A byte slice is ranked by the text it decodes to when it is UTF-8 and by a
 * binary search otherwise, so the tables hold one rank map for each case.
 */
export interface Ranks {
  /** Ranks of the byte slices that decode as text, keyed by that text. */
  readonly stringRanks: Readonly<Record<string, number | undefined>>;
  /** Ranks of the remaining byte slices, bucketed by their first byte. */
  readonly firstByteIndex: ReadonlyArray<ReadonlyArray<RankedBytes> | null>;
}

/**
 * Finds the rank of `key` among byte slices sorted in byte order, or `-1`.
 *
 * The comparison walks the bytes the two slices share, so a slice that is a
 * prefix of the key sorts before it, which is the order the generated tables use.
 */
export const binarySearchRank = (sorted: ReadonlyArray<RankedBytes>, key: Uint8Array): number => {
  let low = 0;
  let high = sorted.length - 1;

  while (low <= high) {
    const middle = (low + high) >>> 1;
    const candidate = sorted[middle][0];
    let order = 0;
    const shared = Math.min(candidate.length, key.length);

    for (let index = 0; index < shared; index++) {
      order = candidate[index] - key[index];

      if (order !== 0) break;
    }

    if (order === 0) order = candidate.length - key.length;

    if (order === 0) return sorted[middle][1];

    if (order < 0) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return -1;
};

/** The rank of a byte slice, or `NO_RANK` when no token holds it. */
const rankOfSlice = (slice: Uint8Array, ranks: Ranks): number => {
  const text = tryBytesToText(slice);

  if (text !== undefined) {
    const rank = ranks.stringRanks[text];

    if (rank !== undefined) return rank;
  }

  const bucket = ranks.firstByteIndex[slice[0]];

  if (bucket !== null) {
    const rank = binarySearchRank(bucket, slice);

    if (rank !== -1) return rank;
  }

  return NO_RANK;
};

/**
 * Merges the bytes of one piece into the tokens their ranks describe.
 *
 * Every byte starts as its own group, and the lowest-ranked adjacent pair of
 * groups is merged until no pair has a rank — the byte-pair encoding of the
 * piece. `starts` holds the group boundaries and the pair ranks are kept beside
 * them, so a merge refreshes the two ranks it changed instead of rescanning the
 * piece, and the scan for the lowest rank stays linear in the groups.
 */
export const bytePairMerge = (piece: Uint8Array, ranks: Ranks): Array<number> => {
  const starts: Array<number> = [];
  const pairRanks: Array<number> = [];

  /** The rank of the pair of groups that begins at `group`, if both exist. */
  const rankOfPair = (group: number): number =>
    group + 2 >= starts.length
      ? NO_RANK
      : rankOfSlice(piece.subarray(starts[group], starts[group + 2]), ranks);

  // Every byte is a group of its own first: a pair's rank reads the boundaries
  // of the group after it, so all of them have to be in place before ranking.
  for (let at = 0; at <= piece.length; at++) starts[at] = at;

  for (let at = 0; at <= piece.length; at++) {
    pairRanks[at] = at < piece.length - 1 ? rankOfPair(at) : NO_RANK;
  }

  while (starts.length > 1) {
    let lowest = NO_RANK;
    let lowestAt = -1;

    for (let at = 0; at < pairRanks.length - 1; at++) {
      if (pairRanks[at] < lowest) {
        lowest = pairRanks[at];
        lowestAt = at;
      }
    }

    if (lowestAt === -1) break;

    starts.splice(lowestAt + 1, 1);
    pairRanks.splice(lowestAt, 1);
    pairRanks[lowestAt] = rankOfPair(lowestAt);

    if (lowestAt > 0) pairRanks[lowestAt - 1] = rankOfPair(lowestAt - 1);
  }

  const tokens: Array<number> = [];

  for (let group = 0; group < starts.length - 1; group++) {
    const rank = rankOfSlice(piece.subarray(starts[group], starts[group + 1]), ranks);

    if (rank !== NO_RANK) tokens.push(rank);
  }

  return tokens;
};
