/**
 * The compression a recording's parts are carried in: the frame they are written
 * and read with.
 *
 * What writes and reads that frame is a {@link Compression}, and the exchange is
 * built over one, so how a recording's parts are carried is a layer's to say
 * rather than the format's: nothing of the format changes when another compression
 * is provided. The layers are a platform package's to state — `@trajs/platform-node`
 * is over the zstd stream `node:zlib` writes and reads one with, and
 * `@trajs/platform-browser` is over a WebAssembly codec that runs where
 * `node:zlib` is not — a page, say — and what either writes the other reads, so a
 * recording either carries the other reads back.
 */

import { Context, Data, Stream } from "effect";

/**
 * What writing or reading the frame a recording's parts are carried in failed
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
 * A compression of a recording's parts: the chunks of a stream in, the chunks of
 * the same stream compressed out.
 *
 * **Details**
 *
 * - `compress` takes the chunks of a stream and gives back the chunks of the same
 *   stream compressed, and `decompress` takes the chunks of a compressed one and
 *   gives back the chunks it decompresses to.
 * - Either direction reports what it failed with as {@link CompressionError}; a
 *   failure of the chunks the stream carries is left to pass through as the failure
 *   it is.
 *
 * @see {@link Compression} for the service the exchange is provided with.
 */
export interface Compression {
  /**
   * Compresses the chunks of a stream into the frame a recording's parts are
   * carried in.
   */
  readonly compress: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | CompressionError, R>;

  /**
   * Decompresses the chunks of the frame a recording's parts are carried in.
   */
  readonly decompress: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | CompressionError, R>;
}

/**
 * The compression a recording's parts are written and read with: what
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
 * programs that keep recordings — what a recording is of is the format's — so the
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
