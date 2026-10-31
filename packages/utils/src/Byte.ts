/**
 * The bytes of a trajectory, read at random.
 *
 * A reader takes only the part it came for, such as a head or a tail.
 * Where the bytes come from is not part of what a sequence is.
 * A read fails as `E` where its source does, and requires `R`.
 *
 * {@link makeByte} builds a sequence from what its reads serve.
 *
 * @stability stable
 */

import { Effect, Stream } from "effect";

/**
 * Where and how much a byte sequence is read by.
 *
 * **When to use**
 *
 * Use to state where {@link Byte.read} and {@link Byte.readAlloc} begin and how much they take.
 *
 * **Details**
 *
 * - `offset` is where the read begins, in bytes, and defaults to `0n`.
 * - `size` is how many bytes are asked for, and defaults to what the read can take.
 *
 * The default `size` is the buffer length given to {@link Byte.read}.
 * For {@link Byte.readAlloc} it is the rest of the sequence.
 * A read yields fewer bytes where the sequence ends before them.
 * An offset at or past that end yields none.
 *
 * @see {@link Byte} for the sequence these are read from.
 * @stability stable
 * @category models
 */
export interface ReadOptions {
  readonly offset?: bigint;
  readonly size?: number;
}

/**
 * A sequence of bytes read at random, as a store serves one.
 *
 * **When to use**
 *
 * Use to read part of a trajectory without holding it whole, such as its head or its tail.
 * Use as well to type what a store serves ({@link ByteStore.read}).
 *
 * **Details**
 *
 * - `length` is how many bytes the sequence holds.
 * - `read` fills a buffer the caller holds and yields how many bytes it read.
 * - `readAlloc` reads into a buffer it allocates, cut to what it read.
 * - `stream` reads the whole sequence from its head, one chunk at a time.
 *
 * A read fails as `E` where what the sequence is of fails, such as a disk.
 * It requires what reading it takes as `R`.
 * A sequence over memory fails with `never`.
 * A store serves one that fails as a {@link ByteStore.ByteStoreError}.
 *
 * **Example** (A sequence of bytes read at random)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { makeByte } from "@trajs/utils/Byte"
 *
 * const held = new TextEncoder().encode("trajs")
 *
 * const bytes = makeByte({
 *   length: Effect.succeed(BigInt(held.length)),
 *   read: (buffer, { offset = 0n, size = buffer.length } = {}) =>
 *     Effect.sync(() => {
 *       const taken = held.subarray(Number(offset), Number(offset) + size)
 *
 *       buffer.set(taken)
 *
 *       return taken.length
 *     })
 * })
 *
 * const tail = await Effect.runPromise(bytes.readAlloc({ offset: 2n }))
 *
 * new TextDecoder().decode(tail) // => "ajs"
 * ```
 *
 * @see {@link makeByte} for building one from the reads it takes.
 * @see {@link ByteStore} for what serves one.
 * @stability stable
 * @category models
 */
export interface Byte<out E = never, out R = never> {
  /**
   * How many bytes the sequence holds.
   *
   * The length is asked when it is wanted, since what it is of may have changed.
   */
  readonly length: Effect.Effect<bigint, E, R>;

  /**
   * Reads up to `size` bytes of the sequence beginning at `offset` into the buffer given.
   *
   * Yields how many bytes were read into it.
   * The buffer is the caller's, and what it holds past those bytes is left as it was.
   * A read of `n` bytes reads into the first `n`.
   */
  readonly read: (buffer: Uint8Array, options?: ReadOptions) => Effect.Effect<number, E, R>;

  /**
   * Reads up to `size` bytes of the sequence beginning at `offset` into a buffer it allocates.
   *
   * Yields that buffer cut to what it read.
   * Without a size, the read takes everything left from the offset to the end of the sequence.
   */
  readonly readAlloc: (options?: ReadOptions) => Effect.Effect<Uint8Array, E, R>;

  /**
   * The whole sequence, read from its head in chunks as the consumer pulls them.
   *
   * What a sequence holds is read as it arrives.
   * `chunkSize` states how many bytes are read at a time, and defaults to 64 KiB.
   * A chunk is allocated as it is read, so a caller states how much to hold at once.
   */
  readonly stream: (options?: { readonly chunkSize?: number }) => Stream.Stream<Uint8Array, E, R>;
}

/** How many bytes of a sequence are read at a time when it is read as a stream. */
const Chunk = 64 * 1024;

/**
 * Builds a byte sequence from what its reads take.
 *
 * **When to use**
 *
 * Use to serve the bytes a store holds ({@link ByteStore.read}).
 * Use as well to read bytes that are somewhere a store is not, such as a buffer in memory.
 *
 * **Details**
 *
 * Only `length` and `read` are asked for.
 * {@link Byte.readAlloc} allocates what it reads into.
 * {@link Byte.stream} reads the sequence from its head one chunk at a time.
 *
 * A read that takes nothing ends that stream, since the sequence ended there.
 * The bytes a sequence holds are what its reads serve from `0n` on.
 *
 * **Example** (Building the sequence a store serves)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const held = new Uint8Array([1, 2, 3])
 *
 * const bytes = makeByte({
 *   length: Effect.succeed(BigInt(held.length)),
 *   read: (buffer, { offset = 0n } = {}) =>
 *     Effect.sync(() => {
 *       const taken = held.subarray(Number(offset), Number(offset) + buffer.length)
 *
 *       buffer.set(taken)
 *
 *       return taken.length
 *     })
 * })
 *
 * const all = await Effect.runPromise(bytes.readAlloc())
 *
 * Array.from(all) // => [1, 2, 3]
 * ```
 *
 * @see {@link Byte} for the sequence this builds.
 * @stability stable
 * @category constructors
 */
export const makeByte = <E = never, R = never>(bytes: {
  readonly length: Effect.Effect<bigint, E, R>;
  readonly read: (buffer: Uint8Array, options?: ReadOptions) => Effect.Effect<number, E, R>;
}): Byte<E, R> => {
  const readAlloc = (options?: ReadOptions): Effect.Effect<Uint8Array, E, R> => {
    const offset = options?.offset ?? 0n;
    const size = options?.size;

    const allocated =
      size === undefined
        ? // Everything left from the offset, which is nothing where the offset is
          // at or past the end of the sequence.
          bytes.length.pipe(
            Effect.map((length) => new Uint8Array(Number(length > offset ? length - offset : 0n))),
          )
        : Effect.sync(() => new Uint8Array(size));

    return allocated.pipe(
      Effect.flatMap((buffer) =>
        bytes
          .read(buffer, { offset, size: buffer.length })
          .pipe(Effect.map((read) => (read === buffer.length ? buffer : buffer.subarray(0, read)))),
      ),
    );
  };

  return {
    ...bytes,
    readAlloc,
    stream: (options) =>
      Stream.unfold(0n, (offset) =>
        readAlloc({ offset, size: options?.chunkSize ?? Chunk }).pipe(
          Effect.map((chunk) =>
            // A read that takes nothing has reached the end of the sequence: the
            // read before it ended there, and this one begins at the end it left.
            chunk.length === 0 ? undefined : ([chunk, offset + BigInt(chunk.length)] as const),
          ),
        ),
      ),
  };
};
