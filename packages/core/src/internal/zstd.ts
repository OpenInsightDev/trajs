/**
 * Streaming zstd compression and decompression of byte streams, backed by the
 * zstd support in `node:zlib`.
 *
 * {@link compress} turns a stream of bytes into a stream of the same bytes
 * compressed and {@link decompress} turns one back, each writing every chunk
 * through a single zstd stream so the bytes are never held in memory.
 */

import { createZstdCompress, createZstdDecompress, type ZstdOptions } from "node:zlib";

import { pipeThroughDuplex } from "@effect/platform-node/NodeStream";
import { Data, Stream } from "effect";

/**
 * A zstd stream failing: what was written could not be compressed, or what was
 * read could not be decompressed.
 *
 * One error covers both, since what failed is the zstd stream; which of the two
 * it was is the operation that was called.
 */
export class CompressFailed extends Data.TaggedError("CompressFailed")<{
  cause: unknown;
}> {}

/**
 * Compresses a byte stream with zstd.
 *
 * **When to use**
 *
 * Use to shrink bytes on their way somewhere else — a file, a socket — without
 * holding the input in memory.
 *
 * **Details**
 *
 * - Every upstream chunk is written to one zstd stream as the downstream pulls
 *   it, and each compressed chunk the stream produces is emitted as soon as it
 *   is available. Back pressure travels upstream: a slow consumer stops reading
 *   what it writes.
 * - The source completing ends the zstd stream, so whatever it still holds is
 *   flushed into the output. The whole output is one zstd frame, which
 *   decompresses in streaming fashion (`createZstdDecompress`) or all at once
 *   (`zstdDecompressSync`), and a source with nothing in it produces a frame
 *   that decodes to nothing.
 * - A failure of the source stream passes through untouched; only a failure of
 *   the zstd stream itself becomes {@link CompressFailed}.
 * - The zstd stream lives in the scope that runs the result, so a downstream
 *   that stops early destroys it. `node:zlib` throws on an option it refuses
 *   before any of that, which is a defect rather than a {@link CompressFailed}.
 *
 * **Example** (Compressing and decompressing text)
 *
 * ```ts import.meta.vitest
 * import { zstdDecompressSync } from "node:zlib"
 *
 * const source = Stream.make(new TextEncoder().encode("hello ".repeat(1024)))
 *
 * const program = Effect.gen(function*() {
 *   const frame = yield* source.pipe(compress(), Stream.runCollect)
 *
 *   zstdDecompressSync(Buffer.concat(frame)).toString().length // => 6144
 * })
 * ```
 *
 * @category combinators
 */
export const compress =
  (options?: ZstdOptions) =>
  <E, R>(self: Stream.Stream<Uint8Array, E, R>): Stream.Stream<Uint8Array, E | CompressFailed, R> =>
    self.pipe(
      pipeThroughDuplex<Uint8Array, CompressFailed>({
        evaluate: () => createZstdCompress(options),
        onError: (cause) => new CompressFailed({ cause }),
      }),
    );

/**
 * Decompresses a byte stream with zstd.
 *
 * **When to use**
 *
 * Use to read back the bytes {@link compress} wrote without holding a frame in
 * memory.
 *
 * **Details**
 *
 * - Every upstream chunk is written to one zstd stream as the downstream pulls
 *   it, and each decompressed chunk is emitted as soon as it is available.
 * - What this reads is the body of a file, which is one frame: a frame that is
 *   cut short fails as {@link CompressFailed} rather than decompressing the
 *   part of it that arrived.
 * - A failure of the source stream passes through untouched; only a failure of
 *   the zstd stream itself becomes {@link CompressFailed}.
 *
 * It takes nothing to configure, since a frame carries what decompressing it
 * takes, where compressing takes a level.
 *
 * **Example** (Decompressing what a compression wrote)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const source = Stream.make(new TextEncoder().encode("hello ".repeat(1024)))
 *
 * const program = Effect.gen(function*() {
 *   const frame = yield* source.pipe(compress(), Stream.runCollect)
 *   const back = yield* Stream.fromIterable(frame).pipe(decompress, Stream.runCollect)
 *
 *   new TextDecoder().decode(Buffer.concat(back)).length // => 6144
 * })
 * ```
 *
 * @see {@link compress} for the other direction.
 * @category combinators
 */
export const decompress = <E, R>(
  self: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<Uint8Array, E | CompressFailed, R> =>
  self.pipe(
    pipeThroughDuplex<Uint8Array, CompressFailed>({
      evaluate: () => createZstdDecompress(),
      onError: (cause) => new CompressFailed({ cause }),
    }),
  );
