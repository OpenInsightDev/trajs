/**
 * The zstd stream a recording's parts are carried in, as `node:zlib` writes and
 * reads one.
 *
 * {@link layer} is the {@link Compression} `Exchange.nodeLayer` provides the
 * exchange with, over the primitives below, which write and read the stream
 * itself. What a recording is of is the format's, and what writes and reads the
 * frame it carries the parts in is this.
 */

import { createZstdCompress, createZstdDecompress, type ZstdOptions } from "node:zlib";

import { pipeThroughDuplex } from "@effect/platform-node/NodeStream";
import { Data, Layer, Stream } from "effect";

import { Compression } from "#/Exchange.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

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

/**
 * The zstd stream refusing the bytes it was given, as the recording that failed.
 *
 * What the zstd stream refuses is part of the recording — the bytes of a frame are
 * the format's — so it fails as a {@link TrajectoryError} like any other part of
 * the format does, rather than as a failure of the stream that a program reading
 * the recording would have to know about.
 */
const refused = <E, R>(
  bytes: Stream.Stream<Uint8Array, E | CompressFailed, R>,
): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
  bytes.pipe(
    Stream.catchTag("CompressFailed", (cause) => Stream.fail(TrajectoryError.parse(cause))),
  );

/**
 * The compression `Exchange.nodeLayer` provides the exchange with: the zstd stream
 * `node:zlib` writes and reads one with, at the level zstd defaults to.
 *
 * Each frame is written and read through one zstd stream per run, so the bytes are
 * never held whole.
 */
export const layer: Layer.Layer<Compression> = Layer.succeed(Compression, {
  compress: (bytes) => refused(compress()(bytes)),
  decompress: (bytes) => refused(decompress(bytes)),
});
