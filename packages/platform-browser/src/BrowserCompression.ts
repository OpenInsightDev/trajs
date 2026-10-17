/**
 * The compression a program computes anywhere with: a frame the streams a browser
 * states write and read one with — gzip and deflate — a zstd frame carried by the
 * WebAssembly codec `@structured-world/structured-zstd`, or the bytes as they are.
 *
 * {@link layer} is the {@link Compression} this package provides the exchange with,
 * over those codecs, which run where `node:zlib` is not — a page, say. What each of
 * them writes is the same frame the other platform packages write for the same
 * algorithm, so a frame either writes the others read. The codecs are imported with
 * this module, which only a program that depends on this package imports.
 */

import {
  createCompressStream,
  createDecompressStream,
  type CompressStream,
} from "@structured-world/structured-zstd";
import {
  Algorithm,
  Compression,
  CompressionError,
  defaultAlgorithm,
  type Options,
} from "@trajs/utils/Compression";
import { Effect, Layer, Stream } from "effect";

/** A handle of the WebAssembly codec: what one direction of a frame is written and read through. */
type Handle = Pick<CompressStream, "push" | "finish" | "free">;

/** One direction of a frame: the chunks of a stream in, the chunks of the frame out. */
type Frame = <E, R>(
  bytes: Stream.Stream<Uint8Array, E, R>,
) => Stream.Stream<Uint8Array, E | CompressionError, R>;

/** What the codecs refuse a frame for, as the compression that failed. */
const refused = (cause: unknown): CompressionError => new CompressionError({ cause });

/**
 * Carries a stream of chunks through one handle of the codec: every chunk is fed
 * to the handle as the downstream pulls it, whatever the handle has complete is
 * emitted, and the frame is sealed when the chunks end.
 *
 * The handle belongs to the run of the stream it carries, so it is freed when that
 * stream ends — and when a downstream stops reading early, which is when it would
 * otherwise be left to the engine's collector.
 */
const carried = <E, R>(
  open: () => Promise<Handle>,
  bytes: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<Uint8Array, E | CompressionError, R> =>
  Effect.acquireRelease(Effect.tryPromise({ try: open, catch: refused }), (handle) =>
    Effect.sync(() => handle.free()),
  ).pipe(
    Effect.map((handle) =>
      bytes.pipe(
        // One frame is one stream the handle keeps across the chunks, so the
        // chunks are fed to it one at a time and in the order they are read.
        Stream.mapEffect((chunk) => Effect.try({ try: () => handle.push(chunk), catch: refused }), {
          concurrency: 1,
        }),
        Stream.filter((piece) => piece.length > 0),
        Stream.concat(
          Effect.try({ try: () => handle.finish(), catch: refused }).pipe(Stream.fromEffect),
        ),
      ),
    ),
    Stream.unwrap,
  );

/**
 * Carries a stream of chunks through one of the streams a browser states itself:
 * the codec is handed the chunks as the downstream pulls them and what it writes is
 * emitted as it is available, so the bytes are carried rather than held.
 *
 * What a browser states is one call over a whole `ReadableStream`, so the stream the
 * chunks arrive in is handed to it — which is where the back pressure between the
 * two travels.
 */
const piped = <E, R>(
  open: (bytes: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>,
  bytes: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<Uint8Array, E | CompressionError, R> =>
  Stream.toReadableStreamEffect(bytes).pipe(
    Effect.map((source) =>
      Stream.fromReadableStream({ evaluate: () => open(source), onError: refused }),
    ),
    Stream.unwrap,
  );

/**
 * A browser's codec as the pair of streams a frame is carried through: the binary of
 * a trajectory's parts is what is written into it and what is read back from it.
 */
type Pair = ReadableWritablePair<Uint8Array, Uint8Array>;

/**
 * A browser's codec as the pair this side carries a frame through.
 *
 * The writable of `CompressionStream` and `DecompressionStream` is declared a
 * `WritableStream<BufferSource>` — any binary a caller may hand one — where the
 * chunks a trajectory's frame arrives in are `Uint8Array` over buffers this side does
 * not name; what the pair states is what the codec reads and writes at run time,
 * which its own declaration cannot state.
 */
const asPair = (codec: CompressionStream | DecompressionStream): Pair => {
  // SAFETY: a browser's codec reads and writes any binary, and a chunk of a frame is
  // binary; the declaration is wider than the `Uint8Array` this side carries.
  const pair = codec as Pair;

  return pair;
};

/**
 * One direction of a frame as a browser states it: `CompressionStream` writes a gzip
 * or deflate frame, and `DecompressionStream` reads one.
 */
const web =
  (format: "gzip" | "deflate", direction: "compress" | "decompress"): Frame =>
  (bytes) =>
    piped(
      (source) =>
        source.pipeThrough(
          asPair(
            direction === "compress"
              ? new CompressionStream(format)
              : new DecompressionStream(format),
          ),
        ),
      bytes,
    );

/**
 * The algorithms a codec is needed for: every one the compression states but the
 * bytes carried as they are.
 */
type CodedAlgorithm = Exclude<Algorithm, typeof Algorithm.None>;

const compressors: Record<CodedAlgorithm, Frame> = {
  [Algorithm.Deflate]: web("deflate", "compress"),
  [Algorithm.Gzip]: web("gzip", "compress"),
  [Algorithm.Zstd]: (bytes) => carried(() => createCompressStream(), bytes),
};

const decompressors: Record<CodedAlgorithm, Frame> = {
  [Algorithm.Deflate]: web("deflate", "decompress"),
  [Algorithm.Gzip]: web("gzip", "decompress"),
  [Algorithm.Zstd]: (bytes) => carried(() => createDecompressStream(), bytes),
};

/**
 * The compression a program computes anywhere with, over the codecs a browser
 * states and the WebAssembly zstd codec.
 *
 * **When to use**
 *
 * Use when a program runs where `node:zlib` is not — a page, a worker, Deno — or
 * when every run should write and read a trajectory with the same codecs.
 *
 * **Details**
 *
 * gzip and deflate are the frames `CompressionStream` and `DecompressionStream`
 * write and read, and zstd is the WebAssembly codec's, whose engine picks the SIMD
 * payload where the host has it and the scalar one where it has not. Each frame is
 * carried through one codec per run, so a trajectory is written and read as it
 * arrives — as it is on Node, where `node:zlib` is what the algorithms are stated
 * over.
 *
 * `none` carries the parts as the format encodes them, which is the frame that costs
 * nothing to write and the most to keep. The algorithm is the layer's to state
 * ({@link Options}), and defaults to zstd, the frame a trajectory has always been
 * carried in.
 *
 * @see {@link Compression} for the compression this provides.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<Compression> => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;

  return Layer.succeed(Compression, {
    algorithm,
    compress: (bytes) => (algorithm === Algorithm.None ? bytes : compressors[algorithm](bytes)),
    decompress: (bytes) => (algorithm === Algorithm.None ? bytes : decompressors[algorithm](bytes)),
  });
};
