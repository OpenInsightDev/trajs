/**
 * The frames a compression carries, as `Compression.make` derives them from the
 * codec of a platform.
 */

import { Effect, Stream } from "effect";

import {
  Algorithm,
  type Codec,
  type Compression,
  type CompressionError,
  type Options,
  defaultAlgorithm,
} from "#/Compression.ts";

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

/** `None` states no codec, so the chunks are passed through here. */
const direction =
  (codecs: Codec["compress"]): Compression["compress"] =>
  (options) =>
  <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<Uint8Array, E | CompressionError, R> => {
    const algorithm = options?.algorithm ?? defaultAlgorithm;

    return algorithm === Algorithm.enums.None ? bytes : codecs(algorithm)(bytes);
  };

/**
 * The stream holds the one buffer that was given, so the codec writes or reads
 * exactly one frame.
 */
const held =
  (frame: Compression["compress"]) =>
  (options?: Options) =>
  (bytes: Uint8Array): Effect.Effect<Uint8Array, CompressionError> =>
    Stream.make(bytes).pipe(frame(options), Stream.runCollect, Effect.map(joined));

export const compressionOf = (codec: Codec): Compression => {
  const compress = direction(codec.compress);
  const decompress = direction(codec.decompress);

  return {
    compress,
    compressBytes: held(compress),
    decompress,
    decompressBytes: held(decompress),
  };
};
