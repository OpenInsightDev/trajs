/**
 * Turns token identifiers back into the text they stand for.
 *
 * A token decodes to text when its bytes are UTF-8 and to raw bytes otherwise,
 * and a character may be split across several byte tokens. Byte tokens are
 * therefore collected into one buffer and decoded as a run, so a multi-byte
 * character survives being split, and text tokens flush the buffer first to
 * keep their order.
 */

import { Predicate } from "effect";
import type { Tables } from "#/internal/tables.ts";
import { decodeUtf8 } from "#/internal/text.ts";

/** Bytes a decode collects before it grows the buffer. */
const INITIAL_BUFFER_SIZE = 1024;

/** Decodes token identifiers, ignoring the ones no table holds. */
export const decodeTokens = (tokens: ReadonlyArray<number>, tables: Tables): string => {
  let text = "";
  let buffer: Uint8Array | null = null;
  let buffered = 0;

  for (const token of tokens) {
    const value = tables.decoder[token] ?? tables.inverseSpecialTokens[token];

    if (value === undefined) continue;

    if (Predicate.isString(value)) {
      if (buffer !== null) {
        text += decodeUtf8(buffer.subarray(0, buffered));
        buffer = null;
        buffered = 0;
      }

      text += value;

      continue;
    }

    if (buffer === null) buffer = new Uint8Array(INITIAL_BUFFER_SIZE);

    if (buffered + value.length > buffer.length) {
      const grown: Uint8Array = new Uint8Array(
        Math.max(buffer.length * 2, buffered + value.length),
      );

      grown.set(buffer.subarray(0, buffered));
      buffer = grown;
    }

    buffer.set(value, buffered);
    buffered += value.length;
  }

  if (buffer !== null && buffered > 0) text += decodeUtf8(buffer.subarray(0, buffered));

  return text;
};
