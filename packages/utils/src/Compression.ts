/**
 * The compression a trajectory's parts are carried in: the frame they are written
 * and read with.
 *
 * What writes and reads that frame is a {@link Compression}, and the exchange is
 * built over one, so how a trajectory's parts are carried is a layer's to say
 * rather than the format's: nothing of the format changes when another compression
 * is provided. Which frame is written — the bytes as they are, or zstd, gzip or
 * deflate ({@link Algorithm}) — is stated where the layer is built
 * ({@link Options}), and what writes and reads it is a platform package's to
 * state: `@trajs/platform-node` is over the streams `node:zlib` writes and reads,
 * and `@trajs/platform-browser` is over the codecs a browser states where
 * `node:zlib` is not — a page, say — and what either writes the other reads, in
 * every one of the algorithms, so a trajectory either carries the other reads back.
 * Which of them a trajectory was carried in is what the trajectory states of itself
 * ({@link Compression.algorithm}), so what it was written with is read off the
 * trajectory rather than assumed by whatever reads it.
 */

import { Context, Data, Stream } from "effect";

/**
 * What writing or reading the frame a trajectory's parts are carried in failed
 * with.
 *
 * **When to use**
 *
 * Use to tell a frame that could not be written or read apart from the bytes that
 * failed to arrive: a failure of the source stream passes through untouched, and
 * only a failure of the frame itself is this error.
 *
 * **Details**
 *
 * One error covers both directions, since what failed is the frame; which of the
 * two it was is the operation that was called. `cause` is what the codec failed
 * with, as it reported it.
 *
 * @see {@link Compression} for what reports it.
 */
export class CompressionError extends Data.TaggedError("CompressionError")<{
  cause: unknown;
}> {}

/**
 * The frame a trajectory's parts are carried in: the algorithm it is written and
 * read with.
 *
 * **When to use**
 *
 * Use to name the frame a compression layer is built over, where a program states
 * one ({@link Options}), or to read the one a trajectory states of itself.
 *
 * **Details**
 *
 * - `None` (0) carries the bytes of a stream themselves: nothing is written around
 *   them and nothing is read off them, so what a trajectory holds between its header
 *   line and its metadata is the parts as the format encodes them.
 * - `Zstd` (1) is a zstd frame, which is what {@link defaultAlgorithm} names: it is
 *   the frame a trajectory has always been carried in, so a trajectory written
 *   before an algorithm could be stated is one a layer defaults to reading.
 * - `Gzip` (2) and `Deflate` (3) are the frames a browser states itself — a gzip
 *   frame (RFC 1952) and a deflate frame as zlib wraps one (RFC 1950) — which
 *   `node:zlib` and Bun state as well.
 *
 * A frame is written and read with one algorithm, and what a trajectory was carried
 * in is what the trajectory states of itself: the metadata it ends with states the
 * algorithm its parts were written with as that algorithm's code
 * ({@link Compression.algorithm}), so a program handed a trajectory it did not write
 * can tell what to read it with rather than guessing among the algorithms it has.
 * The codes are the format's: each frame is stated by one of them, and a code is
 * never restated for another frame, so a trajectory is read with the algorithm the
 * code it carries names however long after it was written — which is what makes the
 * number worth carrying in place of the name.
 *
 * Each algorithm is a frame the platform packages write and read with a codec
 * their platform states rather than with code this package computes, and the
 * codecs of one algorithm agree: a trajectory carried by one platform is read back
 * by another, and `None` — no codec at all — is the same bytes wherever it is
 * read.
 *
 * @see {@link Options} for where an algorithm is stated.
 * @see {@link Compression.algorithm} for what a compression states of itself.
 * @category models
 */
export const Algorithm = {
  None: 0,
  Zstd: 1,
  Gzip: 2,
  Deflate: 3,
} as const;

export type Algorithm = (typeof Algorithm)[keyof typeof Algorithm];

/**
 * The frame a compression layer is built over.
 *
 * **When to use**
 *
 * Use where a program states how its trajectories are carried, or to type what a
 * compression layer is built with.
 *
 * **Details**
 *
 * - `algorithm` is the algorithm a frame is written and read with
 *   ({@link Algorithm}), and defaults to {@link defaultAlgorithm} — `Zstd` — so a
 *   program that states nothing carries its trajectories the way they have always
 *   been carried.
 *
 * The option is stated where the layer is built rather than where a trajectory is
 * saved, since what writes a frame is the layer alone: a layer writes every frame
 * it is given with the one algorithm, and that is the algorithm the trajectory
 * states of itself ({@link Compression.algorithm}). What reads one is the layer
 * built over the algorithm the trajectory names, since a trajectory carried in
 * another is read as a frame that does not decode.
 *
 * @see {@link Algorithm} for the frames a program may state.
 * @category models
 */
export interface Options {
  readonly algorithm?: Algorithm;
}

/**
 * The algorithm a frame is carried in when a program states none: `Zstd`.
 *
 * **When to use**
 *
 * Use where a compression layer resolves the option it was built with
 * ({@link Options}), so that what a program stating nothing gets is stated once
 * rather than by each layer.
 *
 * **Details**
 *
 * It is the frame a trajectory has always been carried in, so a program that
 * states no algorithm reads back what a program that stated none wrote, and a
 * trajectory written before an algorithm could be stated is read by the layers
 * this repository ships where they are asked for nothing.
 *
 * @see {@link Algorithm} for what it names.
 * @category constants
 */
export const defaultAlgorithm: Algorithm = Algorithm.Zstd;

/**
 * A compression of a trajectory's parts: the chunks of a stream in, the chunks of
 * the same stream compressed out.
 *
 * **Details**
 *
 * - `algorithm` is which algorithm this compression carries a frame with
 *   ({@link Algorithm}), which a trajectory states of itself.
 * - `compress` takes the chunks of a stream and gives back the chunks of the same
 *   stream compressed, and `decompress` takes the chunks of a compressed one and
 *   gives back the chunks it decompresses to.
 * - Either direction reports what it failed with as {@link CompressionError}; a
 *   failure of the chunks the stream carries is left to pass through as the failure
 *   it is.
 * - Which frame the chunks are carried in is the layer's to state rather than the
 *   operation's ({@link Options}): one compression writes and reads the one frame,
 *   and states it of itself.
 *
 * @see {@link Compression} for the service the exchange is provided with.
 */
export interface Compression {
  /**
   * Which algorithm this compression carries a frame with, as {@link Algorithm}
   * names it: what a trajectory that was written through it states of itself.
   */
  readonly algorithm: Algorithm;

  /**
   * Compresses the chunks of a stream into the frame a trajectory's parts are
   * carried in.
   */
  readonly compress: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | CompressionError, R>;

  /**
   * Decompresses the chunks of the frame a trajectory's parts are carried in.
   */
  readonly decompress: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | CompressionError, R>;
}

/**
 * The compression a trajectory's parts are written and read with: what
 * `yield* Compression` gives carries a stream of chunks through the frame they are
 * carried in.
 *
 * **When to use**
 *
 * Use to require a compression of a program, and the layer a platform package
 * ships to provide it.
 *
 * **Details**
 *
 * What writes and reads that frame is the only thing that changes between the
 * programs that keep trajectories — what a trajectory is of is the format's — so the
 * exchange requires this service rather than holding one itself.
 *
 * Each direction carries a stream rather than holding one: one frame is written or
 * read per call, and nothing of it survives the stream it was carried in.
 *
 * @see {@link Compression} for what it carries a stream with.
 */
export const Compression: Context.Service<Compression, Compression> = Context.Service<
  Compression,
  Compression
>()("trajs/utils/Compression");
