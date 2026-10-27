/**
 * The frame of a trajectory's parts, as `node:zlib` writes and reads one.
 *
 * {@link layer} provides the {@link Compression} of this package.
 * {@link compress} and {@link decompress} run one stream through one `node:zlib`
 * stream, so the bytes are never whole in memory.
 *
 * @stability stable
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
  Algorithm,
  Compression,
  CompressionError,
  defaultAlgorithm,
  type Options,
} from "@trajs/utils/Compression";
import { Layer, Stream } from "effect";

/**
 * The algorithms of the codecs: every algorithm except `None`.
 */
type ZlibAlgorithm = Exclude<Algorithm, typeof Algorithm.enums.None>;

const compressors: Record<ZlibAlgorithm, () => Transform> = {
  [Algorithm.enums.Deflate]: () => createDeflate(),
  [Algorithm.enums.Gzip]: () => createGzip(),
  [Algorithm.enums.Zstd]: () => createZstdCompress(),
};

const decompressors: Record<ZlibAlgorithm, () => Transform> = {
  [Algorithm.enums.Deflate]: () => createInflate(),
  [Algorithm.enums.Gzip]: () => createGunzip(),
  [Algorithm.enums.Zstd]: () => createZstdDecompress(),
};

/**
 * Carries a stream of chunks through one `node:zlib` stream.
 *
 * The stream belongs to the run. An early downstream stop destroys it.
 */
const through = (open: () => Transform) =>
  pipeThroughDuplex<Uint8Array, CompressionError>({
    evaluate: open,
    onError: (cause) => new CompressionError({ cause }),
  });

/**
 * Compresses a byte stream into one frame.
 *
 * **When to use**
 *
 * Use to shrink bytes for a file or a socket. The input is never whole in memory.
 *
 * **Details**
 *
 * - Each upstream chunk goes to one `node:zlib` stream as the downstream pulls.
 *   Each compressed chunk is emitted on arrival. A slow consumer stops the writes
 *   upstream.
 * - The end of the source ends the stream and flushes the rest. The output is one
 *   complete frame. `zstdDecompressSync`, `gunzipSync` or `inflateSync` reads it
 *   at once. An empty source yields a frame of no bytes.
 * - `None` writes no frame. Chunks are emitted on arrival and none is held.
 * - A failed source passes through untouched. Only a stream failure raises
 *   {@link CompressionError}.
 *
 * **Gotchas**
 *
 * The stream belongs to the run. An early downstream stop destroys it.
 *
 * **Example** (Compressing text into a gzip frame)
 *
 * ```ts import.meta.vitest
 * import { gunzipSync } from "node:zlib"
 * import { Effect, Stream } from "effect"
 * import { Algorithm } from "@trajs/utils/Compression"
 *
 * const source = Stream.make(new TextEncoder().encode("hello ".repeat(1024)))
 *
 * const program = Effect.gen(function*() {
 *   const frame = yield* source.pipe(compress({ algorithm: Algorithm.enums.Gzip }), Stream.runCollect)
 *
 *   gunzipSync(Buffer.concat(frame)).toString().length // => 6144
 * })
 * ```
 *
 * @see {@link decompress} for the other direction.
 * @see {@link Options} for the algorithm it writes with.
 * @stability stable
 * @category combinators
 */
export const compress =
  (options?: Options) =>
  <E, R>(
    self: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<Uint8Array, E | CompressionError, R> => {
    const algorithm = options?.algorithm ?? defaultAlgorithm;

    return algorithm === Algorithm.enums.None ? self : self.pipe(through(compressors[algorithm]));
  };

/**
 * Decompresses a byte stream written by {@link compress}.
 *
 * **When to use**
 *
 * Use to read the bytes of one frame back. The frame is never whole in memory.
 *
 * **Details**
 *
 * - Each upstream chunk goes to one `node:zlib` stream as the downstream pulls,
 *   and each decompressed chunk is emitted on arrival.
 * - The input is one frame. A truncated frame raises {@link CompressionError}. A
 *   frame of another algorithm raises the same error.
 * - `None` reads no frame. Chunks are emitted on arrival.
 * - A failed source passes through untouched. Only a stream failure raises
 *   {@link CompressionError}.
 *
 * The frame needs only its algorithm, so `options` holds nothing else.
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
 * @stability stable
 * @category combinators
 */
export const decompress =
  (options?: Options) =>
  <E, R>(
    self: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<Uint8Array, E | CompressionError, R> => {
    const algorithm = options?.algorithm ?? defaultAlgorithm;

    return algorithm === Algorithm.enums.None ? self : self.pipe(through(decompressors[algorithm]));
  };

/**
 * The compression of a Node program: the streams of `node:zlib`.
 *
 * **When to use**
 *
 * Use in a Node program with `node:zlib` available. It covers every algorithm of
 * the browser compression, plus zstd.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own ({@link Options}).
 * An omitted algorithm means zstd, the historical frame. `None` stores the parts
 * unwrapped.
 *
 * One algorithm yields the same frame as the other platform packages, so every
 * package reads every trajectory.
 *
 * `node:zlib` is a Node builtin, so this package is for Node only. Where
 * `node:zlib` is absent, `@trajs/platform-browser` supplies the compression.
 *
 * @see {@link Compression} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<Compression> = Layer.succeed(Compression, {
  compress,
  decompress,
});
