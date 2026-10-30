/**
 * The compression of a program without `node:zlib`: the browser codecs and the
 * WebAssembly zstd codec.
 *
 * {@link layer} provides the {@link Compression} of this package. One algorithm
 * yields the same frame as the other platform packages. Only a program with a
 * dependency on this package imports the codecs.
 *
 * @stability stable
 */

import {
  createCompressStream,
  createDecompressStream,
  type CompressStream,
} from "@structured-world/structured-zstd";
import {
  Algorithm,
  type CodedAlgorithm,
  Compression,
  CompressionError,
  type Frame,
  make,
} from "@trajs/utils/Compression";
import { Effect, Layer, Stream } from "effect";

/** The WebAssembly handle of one frame direction. */
type Handle = Pick<CompressStream, "push" | "finish" | "free">;

/** A thrown codec value, as a {@link CompressionError}. */
const refused = (cause: unknown): CompressionError => new CompressionError({ cause });

/**
 * Carries a stream of chunks through one handle of the WebAssembly codec.
 *
 * The handle belongs to the run of the stream, so it is freed when the stream ends
 * or a downstream stops reading early.
 */
const carried =
  (open: () => Promise<Handle>): Frame =>
  (bytes) =>
    Effect.acquireRelease(Effect.tryPromise({ try: open, catch: refused }), (handle) =>
      Effect.sync(() => handle.free()),
    ).pipe(
      Effect.map((handle) =>
        bytes.pipe(
          // One frame is one stream the handle keeps across the chunks, so the
          // chunks are fed to it one at a time and in the order they are read.
          Stream.mapEffect(
            (chunk) => Effect.try({ try: () => handle.push(chunk), catch: refused }),
            {
              concurrency: 1,
            },
          ),
          Stream.filter((piece) => piece.length > 0),
          Stream.concat(
            Effect.try({ try: () => handle.finish(), catch: refused }).pipe(Stream.fromEffect),
          ),
        ),
      ),
      Stream.unwrap,
    );

/**
 * Carries a stream of chunks through one of the streams a browser states.
 *
 * A browser takes a whole `ReadableStream`, so the stream of chunks is handed to
 * it, and the back pressure travels between the two.
 */
const piped =
  (open: (bytes: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>): Frame =>
  (bytes) =>
    Stream.toReadableStreamEffect(bytes).pipe(
      Effect.map((source) =>
        Stream.fromReadableStream({ evaluate: () => open(source), onError: refused }),
      ),
      Stream.unwrap,
    );

/** A browser codec as a readable/writable pair of binary chunks. */
type Pair = ReadableWritablePair<Uint8Array, Uint8Array>;

/**
 * A browser codec as the pair this side carries a frame through.
 *
 * `CompressionStream` and `DecompressionStream` declare a writable of
 * `WritableStream<BufferSource>`, a type wider than `Uint8Array`. A frame chunk is
 * a `Uint8Array` over a buffer this side does not name. The pair reads and writes
 * binary at run time. The declaration cannot state that.
 */
const asPair = (codec: CompressionStream | DecompressionStream): Pair => {
  // SAFETY: a browser's codec reads and writes any binary, and a chunk of a frame is
  // binary; the declaration is wider than the `Uint8Array` this side carries.
  const pair = codec as Pair;

  return pair;
};

/**
 * One direction of a frame as a browser states it.
 *
 * `CompressionStream` writes a gzip or deflate frame. `DecompressionStream` reads
 * one.
 */
const web = (format: "gzip" | "deflate", direction: "compress" | "decompress"): Frame =>
  piped((source) =>
    source.pipeThrough(
      asPair(
        direction === "compress" ? new CompressionStream(format) : new DecompressionStream(format),
      ),
    ),
  );

const compressors: Record<CodedAlgorithm, Frame> = {
  [Algorithm.enums.Deflate]: web("deflate", "compress"),
  [Algorithm.enums.Gzip]: web("gzip", "compress"),
  [Algorithm.enums.Zstd]: carried(() => createCompressStream()),
};

const decompressors: Record<CodedAlgorithm, Frame> = {
  [Algorithm.enums.Deflate]: web("deflate", "decompress"),
  [Algorithm.enums.Gzip]: web("gzip", "decompress"),
  [Algorithm.enums.Zstd]: carried(() => createDecompressStream()),
};

/**
 * The compression of a program without `node:zlib`.
 *
 * **When to use**
 *
 * Use in a page, a worker or Deno, where `node:zlib` is not there. Use it as well
 * when every run should write and read a trajectory with the same codecs.
 *
 * **Details**
 *
 * Gzip and deflate use `CompressionStream` and `DecompressionStream`. Zstd uses
 * the WebAssembly codec, with a SIMD payload where the host has SIMD and a scalar
 * one otherwise.
 *
 * Every algorithm is available, and each call states its own (`Compression.Options`).
 * An omitted algorithm means zstd, the historical frame. `None` stores the parts
 * unwrapped.
 *
 * Each frame goes through one codec per run.
 * A frame over a stream is carried rather than held, and a frame over one
 * buffer is that buffer.
 *
 * @see {@link Compression} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<Compression> = Layer.succeed(
  Compression,
  make({
    compress: (algorithm) => compressors[algorithm],
    decompress: (algorithm) => decompressors[algorithm],
  }),
);
