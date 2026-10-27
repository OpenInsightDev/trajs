/**
 * The frame of a trajectory's parts.
 *
 * A {@link Compression} writes and reads one frame. The exchange runs over a
 * compression, so a platform package supplies the codecs.
 * `@trajs/platform-node` uses `node:zlib` streams.
 * `@trajs/platform-browser` uses the browser codecs. A frame written on either
 * reads back on both, in every algorithm.
 *
 * The algorithm is stated per call ({@link Options}). The metadata records the
 * algorithm of the parts as a code. A reader decodes with the recorded code.
 *
 * @stability stable
 */

import { Context, Data, Schema, Stream } from "effect";

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
