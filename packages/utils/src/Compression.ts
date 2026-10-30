/**
 * The frame of a trajectory's parts.
 *
 * A {@link Compression} writes and reads one frame. The exchange runs over a
 * compression, so a platform package supplies the codecs ({@link make}).
 * `@trajs/platform-node` uses `node:zlib` streams.
 * `@trajs/platform-browser` uses the browser codecs. A frame written on either
 * reads back on both, in every algorithm.
 *
 * A frame holds the bodies of one chunk's frames, joined in frame order, which
 * is one buffer. {@link Compression.compressBytes} writes that buffer as one
 * frame, and {@link Compression.compress} carries the chunks of a stream for a
 * caller that does not hold them whole. The algorithm is stated per call
 * ({@link Options}), and a stored trajectory records it as a code per chunk.
 *
 * @stability stable
 */

import { Context, Data, Effect, Schema, Stream } from "effect";

import { compressionOf } from "#/internal/compression.ts";

/**
 * A failure to write or read a frame.
 *
 * **When to use**
 *
 * Use to separate a codec failure from a failed source stream.
 *
 * **Details**
 *
 * A failed source stream passes through untouched. Only a codec failure raises
 * this error. `cause` holds the codec error.
 *
 * @see {@link Compression} for the operations.
 * @stability stable
 * @category errors
 */
export class CompressionError extends Data.TaggedError("CompressionError")<{
  cause: unknown;
}> {}

/**
 * The frame algorithm of a trajectory's parts.
 *
 * **When to use**
 *
 * Use to state the algorithm of one call ({@link Options}), or to read the
 * recorded algorithm of a trajectory.
 *
 * **Details**
 *
 * - `None` (0) stores the parts unwrapped.
 * - `Zstd` (1) stores a zstd frame. {@link defaultAlgorithm} is `Zstd`.
 * - `Gzip` (2) stores a gzip frame (RFC 1952).
 * - `Deflate` (3) stores a deflate frame, as zlib wraps one (RFC 1950).
 *
 * Each code is a format contract. A code always names the same algorithm, so an
 * old trajectory decodes with its recorded code.
 *
 * A platform package supplies one codec per algorithm. Codecs of the same
 * algorithm agree, so one platform writes the frames another reads. `None` needs
 * no codec.
 *
 * @see {@link Options} for the algorithm of one call.
 * @stability stable
 * @category models
 */
export const Algorithm = Schema.Enum({
  None: 0,
  Zstd: 1,
  Gzip: 2,
  Deflate: 3,
} as const);

export type Algorithm = Schema.Schema.Type<typeof Algorithm>;

/**
 * The frame option of one compression call.
 *
 * **When to use**
 *
 * Use to state the algorithm of {@link Compression.compress} or
 * {@link Compression.decompress}.
 *
 * **Details**
 *
 * `algorithm` holds the algorithm ({@link Algorithm}). {@link defaultAlgorithm}
 * applies when `algorithm` is omitted.
 *
 * One compression handles every algorithm of its platform. State `algorithm` per
 * call to write different frames. A read uses the recorded algorithm, so the
 * caller states none.
 *
 * @see {@link Algorithm} for the available algorithms.
 * @stability stable
 * @category models
 */
export interface Options {
  readonly algorithm?: Algorithm;
}

/**
 * The default algorithm: `Zstd`.
 *
 * **When to use**
 *
 * Use in a compression to resolve an omitted option ({@link Options}).
 *
 * **Details**
 *
 * `Zstd` is the historical frame of a trajectory. A call without an algorithm
 * reads what an earlier call without one wrote. Older trajectories decode the
 * same way.
 *
 * @see {@link Algorithm} for the code.
 * @stability stable
 * @category constants
 */
export const defaultAlgorithm: Algorithm = Algorithm.enums.Zstd;

/**
 * The compression service of the exchange.
 *
 * **Details**
 *
 * - `compress` takes the chunks of a stream and an algorithm ({@link Options}).
 *   It returns the chunks as one frame.
 * - `decompress` takes the chunks of a frame and returns the decompressed chunks.
 * - `compressBytes` takes the bytes of a chunk's body and returns them as one
 *   frame, and `decompressBytes` reads one frame back into them.
 * - A codec failure raises {@link CompressionError}. A failed chunk passes
 *   through untouched.
 * - Each call states the algorithm. {@link defaultAlgorithm} applies when
 *   `algorithm` is omitted.
 *
 * @see {@link Options} for the algorithm of one call.
 * @stability stable
 * @category services
 */
export interface Compression {
  /**
   * Compresses the chunks of a stream into the stated frame.
   */
  readonly compress: (
    options?: Options,
  ) => <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | CompressionError, R>;

  /**
   * Decompresses the chunks of a frame of the stated algorithm.
   */
  readonly decompress: (
    options?: Options,
  ) => <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | CompressionError, R>;

  /**
   * Compresses the bytes of one chunk's body into one frame.
   *
   * **When to use**
   *
   * Use to write the body region of a chunk, which a writer assembles in memory
   * and stores as one frame.
   *
   * **Details**
   *
   * The bytes are the bodies of a chunk's frames, joined in frame order. What is
   * yielded is that region once compressed, as exactly one frame, which
   * {@link Compression.decompressBytes} reads back.
   *
   * A writer compares the length of what is yielded with the length it gave, and
   * stores the region unwrapped where compressing it did not make it smaller.
   *
   * A codec failure raises {@link CompressionError}.
   */
  readonly compressBytes: (
    options?: Options,
  ) => (bytes: Uint8Array) => Effect.Effect<Uint8Array, CompressionError>;

  /**
   * Decompresses one frame into the bytes of one chunk's body.
   *
   * **When to use**
   *
   * Use to read the body region of a chunk, which is one frame of the recorded
   * algorithm.
   *
   * **Details**
   *
   * What is given is one frame, and the bytes given to
   * {@link Compression.compressBytes} are yielded back.
   *
   * A codec failure raises {@link CompressionError}.
   */
  readonly decompressBytes: (
    options?: Options,
  ) => (bytes: Uint8Array) => Effect.Effect<Uint8Array, CompressionError>;
}

/**
 * The compression of the exchange.
 *
 * **When to use**
 *
 * Use to require a compression. Provide the layer of a platform package.
 *
 * **Details**
 *
 * The exchange requires this service, because each platform supplies its own
 * codec. One call writes or reads one frame and keeps nothing between calls.
 * State the algorithm per call ({@link Options}).
 *
 * @see {@link Compression} for the operations.
 * @stability stable
 * @category tags
 */
export const Compression: Context.Service<Compression, Compression> = Context.Service<
  Compression,
  Compression
>()("trajs/utils/Compression");

/**
 * The algorithms a codec states: every algorithm except `None`.
 *
 * **When to use**
 *
 * Use in a platform package, to state the frame of each algorithm its runtime
 * writes and reads.
 *
 * **Details**
 *
 * `None` writes no frame, so it needs no codec and is not among these. Every
 * other algorithm of {@link Algorithm} is.
 *
 * @see {@link Codec} for where a codec states them.
 * @stability stable
 * @category models
 */
export type CodedAlgorithm = Exclude<Algorithm, typeof Algorithm.enums.None>;

/**
 * One direction of a frame, from the chunks of a stream to the chunks of the frame.
 *
 * **When to use**
 *
 * Use to state what a codec writes or reads an algorithm with ({@link Codec}), or to carry
 * a stream through a codec of your own.
 *
 * **Details**
 *
 * A chunk of a frame is a `Uint8Array`.
 * A codec may hold the chunks of a stream where its runtime states only whole-buffer calls.
 *
 * A codec failure is {@link CompressionError}, and a failed source passes through untouched.
 *
 * @see {@link Compression.compress} for the same direction with the options of a call.
 * @stability stable
 * @category models
 */
export type Frame = <E, R>(
  bytes: Stream.Stream<Uint8Array, E, R>,
) => Stream.Stream<Uint8Array, E | CompressionError, R>;

/**
 * The frames a platform writes and reads, one per algorithm.
 *
 * **When to use**
 *
 * Use in a platform package, to state what its runtime carries a frame with.
 *
 * **Details**
 *
 * - `compress` states the codec that writes the frame of an algorithm.
 * - `decompress` states the codec that reads one.
 *
 * A codec states no options and no `None` ({@link CodedAlgorithm}). What a call states, and
 * the bytes passed through untouched, are read where {@link make} resolves it.
 *
 * @see {@link make} for the service it builds.
 * @see {@link Frame} for what a codec states of one algorithm.
 * @stability stable
 * @category models
 */
export interface Codec {
  readonly compress: (algorithm: CodedAlgorithm) => Frame;
  readonly decompress: (algorithm: CodedAlgorithm) => Frame;
}

/**
 * The compression of a platform's codecs as a service.
 *
 * **When to use**
 *
 * Use in a platform package to provide {@link Compression} over the frames its runtime writes
 * and reads.
 *
 * **Details**
 *
 * The options of a call are resolved here ({@link Options}), and `None` passes the chunks
 * through untouched. {@link Compression.compressBytes} and
 * {@link Compression.decompressBytes} carry one buffer through the same frame.
 *
 * A platform therefore states one codec per algorithm ({@link Codec}), and nothing of the
 * options.
 *
 * @see {@link Codec} for what a platform states.
 * @see {@link Compression} for the service this builds.
 * @stability stable
 * @category constructors
 */
export const make = (codec: Codec): Compression => compressionOf(codec);
