/**
 * The zstd frame a recording's parts are carried in, as Bun writes and reads one.
 *
 * {@link layer} is the {@link Compression} this package provides the exchange with,
 * over `Bun.zstdCompress` and `Bun.zstdDecompress`. What it writes is the same zstd
 * `node:zlib` and the WebAssembly codec write, so a frame either writes the others
 * read.
 */

import { Compression, CompressionError } from "@trajs/utils/Compression";
import { zstdCompress, zstdDecompress } from "bun";
import { Effect, Layer, Stream } from "effect";

/** What Bun refuses a frame for, as the compression that failed. */
const refused = (cause: unknown): CompressionError => new CompressionError({ cause });

/** The bytes of a stream held whole, as the one buffer Bun compresses or decompresses at once. */
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
 * Carries a stream of chunks through one call of a Bun codec: the chunks are held
 * whole, handed to `whole` at once, and what it gives back is emitted as one chunk.
 *
 * Bun states zstd as a whole-buffer operation rather than a stream, so a recording's
 * parts are held while it is written or read rather than carried as they arrive.
 */
const carried = <E, R>(
  whole: (bytes: Uint8Array) => Promise<Uint8Array>,
  bytes: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<Uint8Array, E | CompressionError, R> =>
  Stream.fromEffect(
    bytes.pipe(
      Stream.runCollect,
      Effect.flatMap((chunks) =>
        Effect.tryPromise({ try: () => whole(held(chunks)), catch: refused }),
      ),
    ),
  );

/**
 * The compression a program on Bun carries a recording's parts with: the zstd Bun
 * writes and reads one with.
 *
 * **When to use**
 *
 * Use when a program runs on Bun, where `Bun.zstdCompress` is there.
 *
 * **Details**
 *
 * What it writes is the same zstd `node:zlib` writes and the WebAssembly codec
 * writes, so a frame either writes the others read. Bun states zstd as a
 * whole-buffer operation rather than a stream, so a recording's parts are held while
 * the frame is written or read — which is what this layer costs over the streaming
 * compressions the other platform packages state.
 *
 * @see {@link Compression} for the compression this provides.
 * @category layers
 */
export const layer: Layer.Layer<Compression> = Layer.succeed(Compression, {
  compress: (bytes) => carried(zstdCompress, bytes),
  decompress: (bytes) => carried(zstdDecompress, bytes),
});
