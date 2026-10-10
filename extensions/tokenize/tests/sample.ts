/**
 * A hand-built encoding for the tests.
 *
 * A real encoding is megabytes of generated ranks, so the tests use a small one
 * whose merges are chosen to be read by hand: every byte is a token of its own,
 * a few byte pairs merge into their own tokens, one merged slice is a byte pair
 * of a three-byte character and so is not UTF-8, and a handful of special tokens
 * are declared, two of them overlapping. That covers the string rank table, the
 * binary rank buckets, and the special token paths without shipping generated
 * data.
 */

import { Encoding } from "#/Encoding.ts";

/** Pattern splitting a text into letters, numbers, space and everything else. */
const PATTERN = "\\p{L}+|\\p{N}+|\\s+|[^\\p{L}\\p{N}\\s]+";

/** Byte pairs that merge into a token of their own, keyed by the text they make. */
const MERGES: ReadonlyArray<readonly [string, number]> = [
  ["ll", 256],
  ["ca", 257],
  ["ab", 258],
];

/** The first two bytes of `€`, which are not a complete UTF-8 sequence. */
const EURO_PREFIX = Uint8Array.of(0xe2, 0x82);

/** Token of the `€` prefix. */
const EURO_PREFIX_TOKEN = 262;

/**
 * Markers the encoding reserves, keyed by the text they stand for.
 *
 * The two `z` markers overlap, and the longer one is declared first: the
 * alternation tries its members in this order, so the longer marker wins where
 * both could match, and a call allowing only `zz` still finds it inside `zzz`.
 */
const SPECIAL_TOKENS = {
  "<|endoftext|>": 300,
  "<|fim|>": 301,
  zzz: 303,
  zz: 304,
};

/**
 * Builds an encoding in which every byte is a token and the merges above hold.
 *
 * The binary ranks only have to be in byte order among the slices sharing a
 * first byte, so the merge of the `€` prefix is appended to the bucket of its
 * first byte, after every single byte.
 */
export const sample = (): Encoding => {
  const stringEncoder: Record<string, number> = {};
  const decoder: Record<number, string | Uint8Array> = {};
  const binaryEncoder: Array<readonly [Uint8Array, number]> = [];

  for (let byte = 0; byte < 256; byte++) {
    const one = Uint8Array.of(byte);

    if (byte < 0x80) {
      stringEncoder[String.fromCharCode(byte)] = byte;
      decoder[byte] = String.fromCharCode(byte);
    } else {
      binaryEncoder.push([one, byte]);
      decoder[byte] = one;
    }
  }

  binaryEncoder.push([EURO_PREFIX, EURO_PREFIX_TOKEN]);
  decoder[EURO_PREFIX_TOKEN] = EURO_PREFIX;

  for (const [text, token] of MERGES) {
    stringEncoder[text] = token;
    decoder[token] = text;
  }

  return Encoding.make({
    name: "sample",
    pat_str: PATTERN,
    special_tokens: SPECIAL_TOKENS,
    stringEncoder,
    binaryEncoder,
    decoder,
  });
};
