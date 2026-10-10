/**
 * The generated storage of a byte-pair encoding.
 *
 * An encoding is not a tokenizer: it is the data a provider generates once from
 * a model's merge ranks, and a tokenizer is built from it. The data is written
 * for size and read in a fixed shape — one rank map for the byte slices that
 * decode as text, the ranked binary slices beside it, what every token
 * identifier decodes to, and the special tokens the model reserves — so the
 * shape is declared here and validated where an encoding enters the program.
 *
 * The storage is the one `ai-tokenizer` emits from a model's merge ranks, so an
 * encoding generated for another tokenizer of the same family can be read here
 * as it is.
 */

import { Schema } from "effect";

/**
 * The generated data of one byte-pair encoding.
 *
 * **When to use**
 *
 * Use when passing an encoding to `Tokenizer.layerFromEncoding`, or when
 * validating the data a generator wrote before a tokenizer is built from it.
 *
 * **Details**
 *
 * `pat_str` is the pattern a text is split into pieces with, before the pieces
 * are merged. `stringEncoder` ranks the byte slices that decode as text and
 * `binaryEncoder` ranks the remaining ones in byte order; `decoder` is the
 * inverse of both, mapping every token identifier to what it decodes to — text
 * for a token whose bytes are UTF-8, bytes for one whose bytes are not.
 *
 * `special_tokens` are the markers a model reserves, such as
 * `<|endoftext|>`. They are not merged, and whether a text may contain one is
 * decided per `encode` call.
 *
 * **Example** (Declaring an encoding)
 *
 * ```ts import.meta.vitest
 * import { Encoding } from "@trajs/extension-tokenize"
 *
 * const tiny = Encoding.Encoding.make({
 *   name: "tiny",
 *   pat_str: "\\p{L}+",
 *   special_tokens: {},
 *   stringEncoder: { a: 0, b: 1 },
 *   binaryEncoder: [],
 *   decoder: { 0: "a", 1: "b" }
 * })
 *
 * tiny.name // => "tiny"
 * ```
 *
 * @see `Tokenizer.layerFromEncoding` for building a tokenizer from an encoding.
 * @category models
 */
export class Encoding extends Schema.Class<Encoding>("Encoding")({
  /**
   * Name of the encoding, such as `o200k_base`.
   */
  name: Schema.String,
  /**
   * Pattern a text is split into pieces with.
   */
  pat_str: Schema.String,
  /**
   * Special tokens the encoding declares, keyed by the text they stand for.
   */
  special_tokens: Schema.Record(Schema.String, Schema.Number),
  /**
   * Ranks of the byte slices that decode as text, keyed by that text.
   */
  stringEncoder: Schema.Record(Schema.String, Schema.Number),
  /**
   * Ranks of the remaining byte slices, in byte order.
   */
  binaryEncoder: Schema.Array(Schema.Tuple([Schema.Uint8Array, Schema.Number])),
  /**
   * What every token identifier decodes to, as text or as bytes.
   */
  decoder: Schema.Record(Schema.Number, Schema.Union([Schema.String, Schema.Uint8Array])),
}) {}
