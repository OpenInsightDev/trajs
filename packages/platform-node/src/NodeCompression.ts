/**
 * The frame a recording's parts are carried in, as `node:zlib` writes and reads one:
 * a zstd, gzip or deflate frame, or the bytes as they are.
 *
 * {@link layer} is the {@link Compression} this package provides the exchange
 * with, over the primitives below, which write and read the stream itself. What a
 * recording is of is the format's, and what writes and reads the frame it carries
 * the parts in is this.
 */

import type { Transform } from "node:stream";
import {
  createDeflate,
  createGunzip,
  createGzip,
  createInflate,
  createZstdCompress,
  createZstdDecompress,
} from "node:zlib";

import { pipeThroughDuplex } from "@effect/platform-node/NodeStream";
import {
  Compression,
  CompressionError,
  defaultAlgorithm,
  type Algorithm,
  type Options,
} from "@trajs/utils/Compression";
import { Layer, Stream } from "effect";

/**
 * The algorithms `node:zlib` writes a frame with: every one the compression states
 * but the bytes carried as they are, which no codec is needed for.
 */
type ZlibAlgorithm = Exclude<Algorithm, "none">;

const compressors: Record<ZlibAlgorithm, () => Transform> = {
  deflate: () => createDeflate(),
  gzip: () => createGzip(),
  zstd: () => createZstdCompress(),
};

const decompressors: Record<ZlibAlgorithm, () => Transform> = {
  deflate: () => createInflate(),
  gzip: () => createGunzip(),
  zstd: () => createZstdDecompress(),
};

/**
 * Carries a stream of chunks through one stream of `node:zlib`: every chunk
 * upstream is written to it as the downstream pulls one back.
 *
 * The stream is opened per run and lives in the scope that runs it, so a
 * downstream that stops early destroys it.
 */
const through = (open: () => Transform) =>
  pipeThroughDuplex<Uint8Array, CompressionError>({
    evaluate: open,
    onError: (cause) => new CompressionError({ cause }),
  });

/**
 * Compresses a byte stream into the frame a compression states.
 *
 * **When to use**
 *
 * Use to shrink bytes on their way somewhere else — a file, a socket — without
 * holding the input in memory.
 *
 * **Details**
 *
 * - Every upstream chunk is written to one stream of `node:zlib` as the downstream
 *   pulls it, and each compressed chunk the stream produces is emitted as soon as it
 *   is available. Back pressure travels upstream: a slow consumer stops reading what
 *   it writes.
 * - The source completing ends the stream, so whatever it still holds is flushed
 *   into the output: what is written is one whole frame, which reads back in
 *   streaming fashion or all at once (`zstdDecompressSync` for the frame zstd
 *   writes, `gunzipSync` and `inflateSync` for the other two), and a source with
 *   nothing in it produces a frame that decodes to nothing.
 * - `none` writes no frame at all: the chunks are emitted as they arrive, and none
 *   of them is held.
 * - A failure of the source stream passes through untouched; only a failure of the
 *   stream itself becomes {@link CompressionError}.
 * - The stream lives in the scope that runs the result, so a downstream that stops
 *   early destroys it.
 *
 * **Example** (Compressing text into a gzip frame)
 *
 * ```ts import.meta.vitest
 * import { gunzipSync } from "node:zlib"
 * import { Effect, Stream } from "effect"
 *
 * const source = Stream.make(new TextEncoder().encode("hello ".repeat(1024)))
 *
 * const program = Effect.gen(function*() {
 *   const frame = yield* source.pipe(compress({ algorithm: "gzip" }), Stream.runCollect)
 *
 *   gunzipSync(Buffer.concat(frame)).toString().length // => 6144
 * })
 * ```
 *
 * @see {@link decompress} for the other direction.
 * @see {@link Options} for the algorithm it writes with.
 * @category combinators
 */
export const compress =
  (options?: Options) =>
  <E, R>(
    self: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<Uint8Array, E | CompressionError, R> => {
    const algorithm = options?.algorithm ?? defaultAlgorithm;

    return algorithm === "none" ? self : self.pipe(through(compressors[algorithm]));
  };

/**
 * Decompresses a byte stream written by {@link compress}.
 *
 * **When to use**
 *
 * Use to read back the bytes one of the algorithms wrote without holding a frame in
 * memory.
 *
 * **Details**
 *
 * - Every upstream chunk is written to one stream of `node:zlib` as the downstream
 *   pulls it, and each decompressed chunk is emitted as soon as it is available.
 * - What this reads is the body of a file, which is one frame: a frame that is cut
 *   short fails as {@link CompressionError} rather than decompressing the part of it
 *   that arrived. A frame written with another algorithm fails there too, since what
 *   reads one is the stream of the algorithm it is read with.
 * - `none` reads no frame at all: the chunks are emitted as they arrive.
 * - A failure of the source stream passes through untouched; only a failure of the
 *   stream itself becomes {@link CompressionError}.
 *
 * It takes no option beside the algorithm, since a frame carries what decompressing
 * it takes.
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
 *   const back = yield* Stream.fromIterable(frame).pipe(decompress(), Stream.runCollect)
 *
 *   new TextDecoder().decode(Buffer.concat(back)).length // => 6144
 * })
 * ```
 *
 * @see {@link compress} for the other direction.
 * @see {@link Options} for the algorithm it reads with.
 * @category combinators
 */
export const decompress =
  (options?: Options) =>
  <E, R>(
    self: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<Uint8Array, E | CompressionError, R> => {
    const algorithm = options?.algorithm ?? defaultAlgorithm;

    return algorithm === "none" ? self : self.pipe(through(decompressors[algorithm]));
  };

/**
 * The compression a program on Node carries a recording's parts with: the streams
 * `node:zlib` writes and reads a frame with.
 *
 * **When to use**
 *
 * Use when a program runs on Node, where `node:zlib` is there: it states every
 * algorithm the browser's compression states and zstd beside them, it loads nothing
 * else to do it, and it carries a frame as it is written rather than holding it.
 *
 * **Details**
 *
 * What it writes for an algorithm is what the other platform packages write for the
 * same one — the gzip and deflate a browser states itself, and the zstd
 * `Bun.zstdCompress` and the WebAssembly codec write — so a recording one wrote is
 * a recording the others load. `none` carries the parts as the format encodes them,
 * which is the frame that costs nothing to write and the most to keep.
 *
 * The algorithm is the layer's to state ({@link Options}), and defaults to zstd,
 * the frame a recording has always been carried in.
 *
 * The streams are `node:zlib`'s, so they are loaded when this layer is provided
 * rather than when this module is imported: a program that never provides it — a
 * page — never reaches for them. What a program that runs where `node:zlib` is not
 * provides instead is `@trajs/platform-browser`'s compression.
 *
 * Each frame is written and read through one stream per run, so the bytes are never
 * held whole.
 *
 * @see {@link Compression} for the compression this provides.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<Compression> =>
  Layer.succeed(Compression, {
    compress: (bytes) => compress(options)(bytes),
    decompress: (bytes) => decompress(options)(bytes),
  });
