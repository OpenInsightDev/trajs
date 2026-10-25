/**
 * The bytes a program keeps between readings: a store of byte sequences, cut into
 * chunks as they are written and read back as a {@link Byte}.
 *
 * What holds them is the key/value store of `effect/persistence`
 * (`KeyValueStore`) — memory, a file system, a database — so where the bytes live
 * is the store layer's to say rather than this module's, and nothing of how a
 * sequence is kept changes when another store is provided. The stores this package
 * ships keep them in memory ({@link layer}), in a temporary directory of the file
 * system that goes with the scope ({@link layerFsTemp}), or over the key/value
 * store a program holds ({@link layerKVStore}). What is kept of a
 * sequence is the chunks it is cut into rather than one value, so a sequence too
 * large for a store to hold whole is still written to it and read from it: what a
 * read reaches is read, and the chunks it does not are left where they are.
 */

import { Context, Data, Effect, FileSystem, Formatter, Layer, Path, Sink } from "effect";
import { KeyValueStore } from "effect/persistence";
import type { PlatformError } from "effect/PlatformError";

import { type Byte } from "#/Byte.ts";
import { keyValueStoreBytes } from "#/internal/byte-store.ts";

/**
 * What a sequence is written into a store with.
 *
 * **When to use**
 *
 * Use to type what {@link ByteStore.write} is given, or to state the options where
 * a sequence is written into a store.
 *
 * **Details**
 *
 * - `overwrite` says whether a sequence already held under the id is written over,
 *   and defaults to `true`: a store holds one sequence per id, and writing one
 *   again is how a sequence is kept a second time. A store given `false` fails with
 *   a {@link ByteStoreError} where the id is taken, rather than putting one
 *   sequence where another was.
 *
 * Writing over an id drops what it held before any of the new bytes are written, so
 * a write that ends before the sequence does leaves the id holding nothing rather
 * than the head of one sequence beside the tail of another.
 *
 * @see {@link ByteStore.write} for the operation it is given to.
 */
export interface WriteOptions {
  readonly overwrite?: boolean;
}

/**
 * What a store is built with: how the bytes written to it are cut into chunks.
 *
 * **When to use**
 *
 * Use where a store is built ({@link layer}, {@link layerKVStore}) and how it cuts a
 * sequence matters — the size a store underneath it serves, or the quota one of a
 * limited size imposes.
 *
 * **Details**
 *
 * - `chunkSize` is how many bytes of a sequence are kept under one key, and
 *   defaults to {@link defaultChunkSize}. It states how a sequence is cut as it is
 *   written rather than how it is read: the size a sequence was written with is
 *   kept beside it, so a store built with one size reads a sequence another wrote.
 *
 * @see {@link defaultChunkSize} for the size a store cuts with where none is stated.
 * @category models
 */
export interface Options {
  readonly chunkSize?: number;
}

/**
 * How many bytes of a sequence are kept under one key where a store states no size:
 * 64 KiB, the size {@link Byte.stream} reads a sequence in by default.
 *
 * **When to use**
 *
 * Use where a store resolves the option it was built with ({@link Options}), so that
 * what a program stating nothing gets is stated once rather than by each store.
 *
 * **Details**
 *
 * It is the size a read takes at once ({@link Byte.stream}), so a store keeping a
 * sequence in chunks of it serves the chunks a reader asks for rather than cutting
 * them again, and a chunk of a sequence is read with the size one read of it takes.
 *
 * @see {@link Options} for where the size is stated.
 * @category constants
 */
export const defaultChunkSize = 64 * 1024;

/**
 * A store of byte sequences: the bytes kept under an id, read back as a
 * {@link Byte}, and the sink a sequence is written through.
 *
 * **When to use**
 *
 * Use to keep the bytes of a trajectory where reading them a second time is cheaper
 * than reading them from a storage again — the frame of a trajectory, say — and to
 * write them without holding the sequence whole.
 *
 * **Details**
 *
 * - `read` serves the bytes kept under an id as a {@link Byte}, which what reads
 *   them takes what it needs from: the head of a sequence is answered with the chunk
 *   it falls in, and the chunks after it are not read. An id that holds nothing
 *   fails as a {@link ByteStoreError}.
 * - `write` gives the sink a sequence of that id is written through, so its bytes
 *   are cut and kept as they are produced rather than held whole.
 * - `remove` drops what an id holds — its chunks and the record of them — and
 *   removes nothing where the id holds nothing.
 * - `has` says whether an id holds a sequence.
 *
 * Nothing but an id is asked of a caller: how a sequence is cut is the store's to
 * say ({@link Options}), and the keys its chunks are kept under are read off the id
 * rather than stated with it, so an id names a sequence and nothing else of the
 * store.
 *
 * **Example** (Keeping a sequence of bytes and reading part of it back)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * import { ByteStore } from "@trajs/utils"
 *
 * const program = Effect.gen(function* () {
 *   const store = yield* ByteStore.ByteStore
 *
 *   // Four bytes to a chunk, so the sequence is kept in two of them.
 *   yield* Stream.make(new TextEncoder().encode("trajs")).pipe(Stream.run(store.write("a")))
 *
 *   return yield* (yield* store.read("a")).readAlloc({ offset: 2n })
 * })
 *
 * const bytes = await Effect.runPromise(
 *   program.pipe(Effect.provide(ByteStore.layer({ chunkSize: 4 }))),
 * )
 *
 * new TextDecoder().decode(bytes) // => "ajs"
 * ```
 *
 * @see {@link layer} for the store this service is provided as.
 */
export interface ByteStore {
  /**
   * Serves the bytes kept under `id` as a {@link Byte}.
   *
   * What it serves is read at random rather than at once, so a reader takes the part
   * of the sequence it came for: the chunks a read reaches are read out of the store
   * and joined, and none of the others are. An id that holds nothing fails as a
   * {@link ByteStoreError}.
   *
   * The record an id holds when this runs is what the view serves, so a sequence
   * written again while a view of it is open is read as it was; a chunk the view
   * states that the store no longer holds fails the read rather than serving fewer
   * bytes than the sequence states.
   */
  readonly read: (id: string) => Effect.Effect<Byte<ByteStoreError>, ByteStoreError>;

  /**
   * The sink a sequence is written into `id` through.
   *
   * What is written is cut into chunks as it arrives, and a chunk is kept once it
   * has arrived whole, so a sequence is kept as it is produced rather than once it
   * has ended. Nothing is held open between chunks, so the sink needs no scope of
   * its own.
   *
   * What the id held is dropped before the first byte is written, so a write that
   * ends before the sequence does leaves the id holding nothing rather than the head
   * of one sequence beside the tail of another.
   */
  readonly write: (
    id: string,
    options?: WriteOptions,
  ) => Sink.Sink<void, Uint8Array, never, ByteStoreError>;

  /**
   * Drops what `id` holds: the chunks kept under it and the record naming them.
   */
  readonly remove: (id: string) => Effect.Effect<void, ByteStoreError>;

  /**
   * Says whether `id` holds a sequence.
   */
  readonly has: (id: string) => Effect.Effect<boolean, ByteStoreError>;
}

/**
 * The store a program keeps its bytes in: what `yield* ByteStore` gives reads and
 * writes sequences of bytes over a key/value store.
 *
 * **When to use**
 *
 * Use to require a store of a program, and {@link layer}, {@link layerKVStore} or
 * {@link make} to provide it.
 *
 * **Details**
 *
 * What holds the bytes is a store of `effect/persistence` rather than a place of
 * this package's, so a store is provided at the composition root of a program and
 * reaches the bytes through the service alone. Which store that is — memory, a file
 * system, a database — is the layer's to say, and nothing of how a sequence is kept
 * changes with it.
 *
 * @see {@link ByteStore} for what the service gives.
 */
export const ByteStore: Context.Service<ByteStore, ByteStore> = Context.Service<
  ByteStore,
  ByteStore
>()("trajs/utils/ByteStore");

/**
 * What a store failed with: bytes that could not be read or written, or an id that
 * holds no sequence.
 *
 * **When to use**
 *
 * Use to tell the failure of a store apart from the failure of the bytes it was
 * asked for: a store that refused, that was cut short, or that holds nothing where
 * an id was named fails as this error, where bytes that do not hold what the reader
 * is reading fail as the reader's own error.
 *
 * **Details**
 *
 * `id` names the sequence the store was asked about — the one whose bytes could not
 * be read, or the one that could not be written — and `cause` is what the store
 * failed with, as it reported it: the failure of the key/value store underneath, or
 * the description of what an id did not hold.
 *
 * @see {@link ByteStore} for what a sequence is read and written through.
 * @category errors
 */
export class ByteStoreError extends Data.TaggedError("ByteStoreError")<{
  id: string;
  cause: unknown;
}> {
  override get message(): string {
    return `Failed to read or write '${this.id}': ${Formatter.format(this.cause)}`;
  }
}

/**
 * A store over a key/value store: the bytes kept in chunks in the store given.
 *
 * **When to use**
 *
 * Use where a program holds the store itself rather than requiring the one of
 * `effect/persistence` — building this over a store only it knows, say — or to state
 * the layer over a store at hand from ({@link layerKVStore}).
 *
 * **Details**
 *
 * What the key/value store is given of a sequence is the chunks it is cut into rather
 * than the sequence itself ({@link Options}), so a sequence written through this is
 * held in the chunks of the size it was built with, whatever the size the bytes
 * arrived in.
 *
 * @see {@link ByteStore} for what the store gives.
 * @see {@link layerKVStore} for the same store as a layer over a key/value store.
 * @category constructors
 */
export const make = (store: KeyValueStore.KeyValueStore, options?: Options): ByteStore =>
  keyValueStoreBytes(store, options);

/**
 * The store this package ships: byte sequences kept in chunks in the key/value store
 * of `effect/persistence`.
 *
 * **When to use**
 *
 * Use to keep bytes in the store a program states — memory, a file system, a
 * database — without naming one of them here: a store is provided wherever the bytes
 * are to live, and this reads and writes sequences over it.
 *
 * **Details**
 *
 * A sequence is kept as one record beside the chunks it is cut into, and both are
 * named by the id alone, so a store may hold sequences from more than one part of a
 * program without them meeting: an id names one sequence, and nothing else of the
 * store is read to find it.
 *
 * `options` states how a sequence is cut as it is written ({@link Options}), and the
 * size a sequence was written with is read back from the store, so this reads a
 * sequence written by a store built with another size.
 *
 * @see {@link ByteStore} for the store this provides.
 * @see {@link layer} for the same store over the key/value store in memory.
 * @see {@link make} for the same store built over a store at hand.
 * @category layers
 */
export const layerKVStore = (
  options?: Options,
): Layer.Layer<ByteStore, never, KeyValueStore.KeyValueStore> =>
  Layer.effect(
    ByteStore,
    KeyValueStore.KeyValueStore.pipe(Effect.map((store) => make(store, options))),
  );

/**
 * The store this package ships where a program states nothing: byte sequences kept
 * in the key/value store in memory.
 *
 * **When to use**
 *
 * Use where the bytes are kept for as long as the program runs and no longer — what a
 * reading of a trajectory keeps between its readings, say — and provide
 * {@link layerKVStore} instead where they are to outlive it.
 *
 * **Details**
 *
 * It is {@link layerKVStore} over `KeyValueStore.layerMemory`, so a sequence is kept
 * in the chunks that store cuts it into ({@link Options}) and nothing of it is left
 * when the program ends; nothing else is required of a program, since the key/value
 * store is this layer's own.
 *
 * @see {@link ByteStore} for the store this provides.
 * @see {@link layerKVStore} for the same store over a key/value store a program states.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<ByteStore> =>
  layerKVStore(options).pipe(Layer.provide(KeyValueStore.layerMemory));

/**
 * The store this package ships in a temporary directory of the file system: byte
 * sequences kept in a directory made when the layer is built and removed when the
 * scope it was built in closes.
 *
 * **When to use**
 *
 * Use where the bytes a program keeps are too many to hold in memory for as long as it
 * runs — the frames of the trajectories it reads again and again, say — and are not
 * to be found after it ends: they are kept on disk, in a place the system clears
 * rather than one a program states.
 *
 * **Details**
 *
 * It is {@link layerKVStore} over `KeyValueStore.layerFileSystem` in a directory
 * made by `FileSystem.makeTempDirectoryScoped`, named after `prefix` and defaulting
 * to `"trajs-"`. The directory is the store's own — it holds nothing but the
 * sequences written through the store — and nothing of it is left behind when the
 * scope closes.
 *
 * A sequence is cut into chunks of {@link defaultChunkSize} ({@link Options}); where
 * another size is to be kept, state the store with {@link layerKVStore} over a
 * directory of the program's own.
 *
 * @see {@link ByteStore} for the store this provides.
 * @see {@link layer} for the same store held in memory.
 * @see {@link layerKVStore} for the same store over a key/value store a program states.
 * @category layers
 */
export const layerFsTemp = (
  prefix = "trajs-",
): Layer.Layer<ByteStore, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix });

    return layerKVStore().pipe(Layer.provide(KeyValueStore.layerFileSystem(directory)));
  }).pipe(Layer.unwrap);
