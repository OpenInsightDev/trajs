/**
 * The frame of a trajectory's parts, as Bun writes and reads one.
 *
 * {@link layer} provides the {@link Compression} of this package. Zstd uses
 * `Bun.zstdCompress` and `Bun.zstdDecompress`. Gzip and deflate use
 * `Bun.gzipSync`, `Bun.gunzipSync`, `Bun.deflateSync` and `Bun.inflateSync`.
 * One algorithm yields the same frame as `node:zlib` and the WebAssembly codec.
 *
 * @stability stable
 */

import {
  Algorithm,
  type CodedAlgorithm,
  Compression,
  CompressionError,
  type Frame,
  make,
} from "@trajs/utils/Compression";
import { deflateSync, gunzipSync, gzipSync, inflateSync, zstdCompress, zstdDecompress } from "bun";
import { Effect, Layer, Stream } from "effect";

/** A Bun codec: one whole buffer in, one frame out. */
type Whole = (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>;

const compressors: Record<CodedAlgorithm, Whole> = {
  [Algorithm.enums.Deflate]: deflateSync,
  [Algorithm.enums.Gzip]: gzipSync,
  [Algorithm.enums.Zstd]: zstdCompress,
};

const decompressors: Record<CodedAlgorithm, Whole> = {
  [Algorithm.enums.Deflate]: inflateSync,
  [Algorithm.enums.Gzip]: gunzipSync,
  [Algorithm.enums.Zstd]: zstdDecompress,
};

/** A thrown codec value, as a {@link CompressionError}. */
const refused = (cause: unknown): CompressionError => new CompressionError({ cause });

/** The chunks in one buffer, the input of a Bun codec. */
const held = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

/**
 * Carries a stream of chunks through one call of a Bun codec.
 *
 * Bun states its codecs as whole-buffer calls, so the chunks are held while the
 * frame is written or read.
 */
const carried =
  (whole: Whole): Frame =>
  (bytes) =>
    bytes.pipe(
      Stream.runCollect,
      Effect.flatMap((chunks) =>
        // A synchronous codec throws on a bad frame, so the result is awaited
        // either way.
        Effect.tryPromise({ try: async () => whole(held(chunks)), catch: refused }),
      ),
      Stream.fromEffect,
    );

/**
 * The compression of a Bun program: the codecs of Bun.
 *
 * **When to use**
 *
 * Use in a Bun program with `Bun.zstdCompress` and the other Bun codecs
 * available. It covers every algorithm of the browser compression, plus zstd.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own (`Compression.Options`).
 * An omitted algorithm means zstd, the historical frame. `None` stores the parts
 * unwrapped.
 *
 * One algorithm yields the same frame as the other platform packages, so every
 * package reads every trajectory.
 *
 * Bun supplies whole-buffer codecs, so the parts are held during a write or a
 * read. That is the cost of this layer against the streaming layers of the other
 * platform packages.
 *
 * @see {@link Compression} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<Compression> = Layer.succeed(
  Compression,
  make({
    compress: (algorithm) => carried(compressors[algorithm]),
    decompress: (algorithm) => carried(decompressors[algorithm]),
  }),
);
