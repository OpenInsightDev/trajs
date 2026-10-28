/**
 * The bytes of one frame read as one buffer, as `Compression.make` provides
 * them: the region of a chunk's body is carried through the stream frame of a
 * platform's codec.
 */

import { Effect, Stream } from "effect";

import type { Compression, CompressionError, Options } from "#/Compression.ts";

const joined = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  let length = 0;

  for (const chunk of chunks) {
    length += chunk.length;
  }

  const bytes = new Uint8Array(length);
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

/**
 * One direction of a frame, over the bytes it is given whole.
 *
 * The stream holds the one buffer that was given, so the codec writes or reads
 * exactly one frame.
 */
export const held =
  (frame: Compression["compress"]) =>
  (options?: Options) =>
  (bytes: Uint8Array): Effect.Effect<Uint8Array, CompressionError> =>
    Stream.make(bytes).pipe(frame(options), Stream.runCollect, Effect.map(joined));
