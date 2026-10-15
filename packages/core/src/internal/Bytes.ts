/**
 * A byte sequence read at random, and the sequences this package builds of one:
 * what a storage serves a recording as.
 *
 * What a recording is read out of is bytes, and what reads them takes the part it
 * came for rather than the whole of it — the head of a recording for what it
 * states of itself, its tail for the digest it ends with, the frame between them
 * for the parts of a trajectory — so a sequence is read at random ({@link Bytes}).
 * What one is of is not part of what one is: a file, the range of a bucket, or
 * bytes already in memory are all read the same way, which is why every read is
 * effectful and fails as a {@link StorageError} where what it is of — a disk, a
 * socket — may fail.
 *
 * {@link makeBytes} builds a sequence from the reads a source serves, and
 * {@link fileBytes} builds the one a file holds, which is the sequence the storage
 * this package ships serves a recording as.
 *
 * Nothing here is published: a recording is read and written through
 * `Exchange.load` and `Exchange.save`, which take the bytes of one from the
 * storage they were provided.
 */

import { Effect, FileSystem, Stream } from "effect";

import { asStorageError, type StorageError } from "./StorageError.ts";

/**
 * Where and how much a byte sequence is read by.
 *
 * **When to use**
 *
 * Use to name what {@link Bytes.read} and {@link Bytes.readAlloc} read, what
 * {@link Storage.read} reserves an `options` for, or to type what a caller hands
 * one.
 *
 * **Details**
 *
 * - `offset` is where the read begins, counted in bytes from the start of the
 *   sequence, and defaults to `0n`. A byte sequence is read at random, so a read
 *   names where it starts rather than carrying on from the last one it followed.
 * - `size` is how many bytes are asked for, and defaults to what that read can
 *   take: the length of the buffer {@link Bytes.read} is given, and the rest of
 *   the sequence for {@link Bytes.readAlloc}.
 *
 * What a read yields is what it could read, which is fewer bytes than were asked
 * for where the sequence ends before them — and none at all where the offset is
 * at or past that end.
 *
 * @see {@link Bytes} for the sequence these are read from.
 */
export interface ReadOptions {
  readonly offset?: bigint;
  readonly size?: number;
}

/**
 * A sequence of bytes that can be read at random: what a storage serves of a
 * recording.
 *
 * **When to use**
 *
 * Use to read a recording without holding it whole — or to read part of one, such
 * as its head or its tail — and to type what a storage serves
 * ({@link Storage.read}) or what a sequence of your own reads by
 * ({@link makeBytes}).
 *
 * **Details**
 *
 * - `length` is how many bytes the sequence holds.
 * - `read` fills a buffer the caller holds, beginning at the offset asked for
 *   and taking up to the size asked for, and yields how many bytes it read into
 *   it.
 * - `readAlloc` reads the same way into a buffer it allocates, and yields that
 *   buffer, cut to what was read where the sequence ended before the size asked
 *   for.
 * - `stream` reads the whole sequence from its head, in chunks, so a recording
 *   too large to hold is read as it arrives rather than all at once.
 *
 * Where a byte sequence comes from is not part of what one is: a file, the range
 * of a bucket, or bytes already in memory are all read the same way. So every
 * read is effectful and fails as {@link StorageError}, since what a sequence is
 * of — a disk, a socket — is what may fail, and a sequence over memory is one
 * that never does.
 *
 * **Example** (A sequence of bytes read at random)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const held = new TextEncoder().encode("trajs")
 *
 * const bytes = makeBytes({
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
 * @see {@link makeBytes} for building one from the reads it takes.
 * @see {@link Storage} for what serves one.
 */
export interface Bytes {
  /**
   * How many bytes the sequence holds, asked when it is wanted rather than once
   * when it is made: what a sequence is of may have changed since, and the
   * length is read to tell where a read can reach.
   */
  readonly length: Effect.Effect<bigint, StorageError>;

  /**
   * Reads up to `size` bytes of the sequence beginning at `offset` into the
   * buffer given, and yields how many bytes were read into it.
   *
   * The buffer is the caller's, and what it holds past the bytes read is left as
   * it was: a read of `n` bytes reads into the first `n`, and a read that reaches
   * the end of the sequence before the size asked for reads fewer.
   */
  readonly read: (buffer: Uint8Array, options?: ReadOptions) => Effect.Effect<number, StorageError>;

  /**
   * Reads up to `size` bytes of the sequence beginning at `offset` into a buffer
   * it allocates, and yields that buffer cut to what it read.
   *
   * Without a size, the read takes everything left from the offset to the end of
   * the sequence.
   */
  readonly readAlloc: (options?: ReadOptions) => Effect.Effect<Uint8Array, StorageError>;

  /**
   * The whole sequence, read from its head in chunks as the consumer pulls them,
   * so what a sequence holds is read as it arrives rather than all at once.
   *
   * `chunkSize` states how many bytes are read at a time, and defaults to 64 KiB.
   * A chunk is allocated as it is read, so a caller reading a recording it does not
   * hold states how much of it to hold at once.
   */
  readonly stream: (options?: {
    readonly chunkSize?: number;
  }) => Stream.Stream<Uint8Array, StorageError>;
}

/** How many bytes of a sequence are read at a time when it is read as a stream. */
const Chunk = 64 * 1024;

/**
 * Builds a byte sequence from what its reads take: what a storage serves of the
 * bytes it holds.
 *
 * **When to use**
 *
 * Use to serve the bytes a storage holds ({@link Storage.read}), or to read bytes
 * that are, or that arrive, somewhere a storage is not: a buffer in memory, a
 * range a program fetched, a source it walks.
 *
 * **Details**
 *
 * Only `length` and `read` are asked for, since what the other two are is what
 * those two read: {@link Bytes.readAlloc} allocates what it reads into, and
 * {@link Bytes.stream} reads the sequence from its head one chunk at a time. A
 * read that takes nothing ends that stream, since a read takes what it can and the
 * offset it was asked for is where it started — so the bytes a sequence holds are
 * what its reads serve from the offset `0n` on.
 *
 * **Example** (Building the sequence a storage serves)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const held = new Uint8Array([1, 2, 3])
 *
 * const bytes = makeBytes({
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
 * @see {@link Bytes} for the sequence this builds.
 */
export const makeBytes = (bytes: {
  readonly length: Effect.Effect<bigint, StorageError>;
  readonly read: (buffer: Uint8Array, options?: ReadOptions) => Effect.Effect<number, StorageError>;
}): Bytes => {
  const readAlloc = (options?: ReadOptions): Effect.Effect<Uint8Array, StorageError> => {
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

/**
 * The bytes a file holds, as the storage that keeps recordings in files serves
 * them.
 *
 * A read names where it starts and a file handle is read where its cursor was
 * left, so a read of one recording's bytes opens the file, moves the cursor to the
 * offset asked for, reads what was asked of it and closes the file again: what a
 * read serves holds nothing open between reads, so two reads of the same
 * recording are each their own. It is what `Exchange.nodeLayer` serves the bytes
 * of a recording as.
 */
export const fileBytes = (files: FileSystem.FileSystem, path: string): Bytes =>
  makeBytes({
    length: files.stat(path).pipe(
      Effect.map((info) => info.size),
      Effect.mapError(asStorageError(path)),
    ),
    read: (buffer, { offset = 0n } = {}) =>
      Effect.scoped(
        Effect.gen(function* () {
          const file = yield* files.open(path, { flag: "r" });

          if (offset !== 0n) {
            yield* file.seek(offset, "start");
          }

          return yield* file.read(buffer);
        }),
      ).pipe(Effect.mapError(asStorageError(path))),
  });
