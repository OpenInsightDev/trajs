/**
 * Compiles the generated storage of an encoding into the tables a tokenizer
 * reads.
 *
 * The generated data is written for size: one rank map, one decoder, and the
 * special tokens as declared. Compiling it once per tokenizer turns that into
 * what encoding and decoding ask for — a compiled piece pattern, the ranks of
 * binary slices bucketed by first byte, and the bytes of every special token —
 * so neither path rebuilds anything per call.
 */

import type { Encoding } from "#/Encoding.ts";
import type { RankedBytes } from "#/internal/bpe.ts";
import { encodeUtf8, escapeRegex } from "#/internal/text.ts";

/** The compiled read tables of one encoding. */
export interface Tables {
  /** Name of the encoding. */
  readonly name: string;
  /**
   * Pattern a text is split into pieces with.
   *
   * It matches with the global flag, and matching clones it per call, so two
   * fibers may encode at once without sharing a match position.
   */
  readonly piecePattern: RegExp;
  /** Ranks of the byte slices that decode as text, keyed by that text. */
  readonly stringRanks: Readonly<Record<string, number | undefined>>;
  /** Ranks of the remaining byte slices, bucketed by their first byte. */
  readonly firstByteIndex: ReadonlyArray<ReadonlyArray<RankedBytes> | null>;
  /** What every token identifier decodes to, as text or as bytes. */
  readonly decoder: Readonly<Record<number, string | Uint8Array | undefined>>;
  /** Identifier of every special token, keyed by the text it stands for. */
  readonly specialTokens: Readonly<Record<string, number>>;
  /** The special token texts, in the order the encoding declares them. */
  readonly specialTokenTexts: ReadonlyArray<string>;
  /** Bytes of every special token, keyed by its identifier. */
  readonly inverseSpecialTokens: Readonly<Record<number, Uint8Array | undefined>>;
  /** Alternation matching every special token, or `null` when there is none. */
  readonly specialTokenPattern: string | null;
}

const BYTE_COUNT = 256;

/**
 * Buckets ranked byte slices by their first byte.
 *
 * A slice's first byte decides which bucket could hold it, so a lookup searches
 * the byte sequences that share a beginning instead of the whole table. Buckets
 * keep the order the generated table has, which `binarySearchRank` requires.
 */
const indexByFirstByte = (ranked: ReadonlyArray<RankedBytes>): Array<Array<RankedBytes> | null> => {
  const index: Array<Array<RankedBytes> | null> = Array.from({ length: BYTE_COUNT }, () => null);

  for (const entry of ranked) {
    const bytes = entry[0];

    if (bytes.length === 0) continue;

    const bucket = index[bytes[0]];

    if (bucket === null) {
      index[bytes[0]] = [entry];
    } else {
      bucket.push(entry);
    }
  }

  return index;
};

/**
 * Compiles one encoding's generated data.
 *
 * `extendedSpecialTokens` are read beside the ones the encoding declares, which
 * is how a model adds the markers of its own chat template without regenerating
 * a multi-megabyte table.
 */
export const compile = (
  encoding: Encoding,
  extendedSpecialTokens?: Readonly<Record<string, number>>,
): Tables => {
  const specialTokens = { ...encoding.special_tokens, ...extendedSpecialTokens };

  const specialTokenTexts = Object.keys(specialTokens);
  const inverseSpecialTokens: Record<number, Uint8Array> = {};

  for (const [text, token] of Object.entries(specialTokens)) {
    inverseSpecialTokens[token] = encodeUtf8(text);
  }

  return {
    name: encoding.name,
    piecePattern: new RegExp(encoding.pat_str, "gu"),
    stringRanks: encoding.stringEncoder,
    firstByteIndex: indexByFirstByte(encoding.binaryEncoder),
    decoder: encoding.decoder,
    specialTokens,
    specialTokenTexts,
    inverseSpecialTokens,
    specialTokenPattern:
      specialTokenTexts.length === 0 ? null : specialTokenTexts.map(escapeRegex).join("|"),
  };
};
