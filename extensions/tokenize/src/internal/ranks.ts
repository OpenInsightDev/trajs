/**
 * Reads the published rank source of an encoding into the storage a tokenizer
 * reads.
 *
 * A model's merge ranks are published as one compacted text: the pattern a text
 * is split into pieces with, the special tokens the model reserves, and a line
 * per run of consecutive ranks — the literal first token of the run, the rank it
 * starts at, and the base64 of every token from there on. A token is a byte
 * slice, so reading the source splits it once into the byte slices that decode
 * as text (looked up by that text) and the ones that do not (searched by bytes),
 * which is what makes encoding fast afterwards.
 */

import { Encoding } from "#/Encoding.ts";
import { tryBytesToText } from "#/internal/text.ts";

/**
 * The published rank source of one encoding.
 *
 * **Details**
 *
 * `bpe_ranks` holds the merge tokens, and a token's rank is its position in the
 * source: a line states the rank the run begins at and the base64 of every token
 * of that run, so a source of a model whose special tokens occupy the first
 * ranks starts its first run after them.
 *
 * @category models
 */
export interface RankSource {
  /** Pattern a text is split into pieces with. */
  readonly pat_str: string;
  /** Special tokens the model reserves, keyed by the text they stand for. */
  readonly special_tokens: Readonly<Record<string, number>>;
  /** The compacted merge ranks, one run of consecutive ranks per line. */
  readonly bpe_ranks: string;
}

/** Decodes one base64 token of a source as the bytes it stands for. */
const decodeToken = (token: string): Uint8Array => {
  const binary = atob(token);
  const bytes = new Uint8Array(binary.length);

  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);

  return bytes;
};

/**
 * Reads the rank of every base64 token of a source.
 *
 * The first field of a line is the literal text of the token its run begins
 * with, which is already stated by the base64 token after it, so only the rank
 * and the tokens are read. A line that states no tokens contributes none.
 */
const ranksOf = (bpeRanks: string): Map<string, number> => {
  const ranks = new Map<string, number>();

  for (const line of bpeRanks.split("\n")) {
    if (line.length === 0) continue;

    const fields = line.split(" ");
    const offset = Number.parseInt(fields[1], 10);

    for (let at = 2; at < fields.length; at++) ranks.set(fields[at], offset + at - 2);
  }

  return ranks;
};

/**
 * Orders two ranked byte slices the way the binary rank lookup expects: by byte
 * order, with a slice that is a prefix of another sorting before it.
 */
const compareRankedBytes = (
  left: readonly [Uint8Array, number],
  right: readonly [Uint8Array, number],
): number => {
  const shared = Math.min(left[0].length, right[0].length);

  for (let at = 0; at < shared; at++) {
    const order = left[0][at] - right[0][at];

    if (order !== 0) return order;
  }

  return left[0].length - right[0].length;
};

/**
 * Reads one encoding's rank source into the storage a tokenizer reads.
 *
 * `name` is the name the encoding goes by, which a rank source does not state
 * itself.
 */
export const fromRanks = (name: string, source: RankSource): Encoding => {
  const stringEncoder: Record<string, number> = {};
  const decoder: Record<number, string | Uint8Array> = {};
  const binaryEncoder: Array<readonly [Uint8Array, number]> = [];

  for (const [token, rank] of ranksOf(source.bpe_ranks)) {
    const bytes = decodeToken(token);
    const text = tryBytesToText(bytes);

    if (text === undefined) {
      binaryEncoder.push([bytes, rank]);
      decoder[rank] = bytes;
    } else {
      stringEncoder[text] = rank;
      decoder[rank] = text;
    }
  }

  binaryEncoder.sort(compareRankedBytes);

  return new Encoding({
    name,
    pat_str: source.pat_str,
    special_tokens: source.special_tokens,
    stringEncoder,
    binaryEncoder,
    decoder,
  });
};
