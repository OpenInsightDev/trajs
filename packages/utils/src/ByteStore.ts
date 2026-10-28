/**
 * A store of byte sequences a program keeps between readings, cut into chunks as they are written.
 *
 * What holds them is the key/value store of `effect/persistence`, so where the bytes live is the
 * store layer's to say.
 * A sequence is kept as the chunks it is cut into rather than as one value.
 * A read reaches only the chunks it asks for, so a sequence too large to hold is still written and
 * read.
 *
 * This package states a store in memory ({@link layer}), one in a temporary directory
 * ({@link layerFsTemp}), and one over a key/value store a program holds ({@link layerKVStore}).
 *
 * @stability stable
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
 * Use to state whether a sequence already held is written over, or to type what
 * {@link ByteStore.write} is given.
 *
 * **Details**
 *
 * - `overwrite` says whether a sequence already held under the id is written over, and defaults to
 *   `true`.
 *
 * A store holds one sequence per id, so writing one again is how a sequence is kept a second time.
 * A store given `false` fails with a {@link ByteStoreError} where the id is taken, rather than
 * putting one sequence where another was.
 *
 * Writing over an id drops what it held before any of the new bytes are written.
 * A write that ends before the sequence does leaves the id holding nothing.
 *
 * @see {@link ByteStore.write} for the operation it is given to.
 * @stability stable
 * @category models
 */
export interface WriteOptions {
  readonly overwrite?: boolean;
}

/**
 * How the bytes written to a store are cut into chunks.
 *
 * **When to use**
 *
 * Use where a store is built ({@link layer}, {@link layerKVStore}) and how it cuts a sequence
 * matters, such as the quota of a store of a limited size.
 *
 * **Details**
 *
 * - `chunkSize` is how many bytes of a sequence are kept under one key, and defaults to
 *   {@link defaultChunkSize}.
 *
 * The size states how a sequence is cut as it is written rather than how it is read.
 * The size a sequence was written with is kept beside it, so a store built with one size reads a
 * sequence another wrote.
 *
 * @see {@link defaultChunkSize} for the size a store cuts with where none is stated.
 * @stability stable
 * @category models
 */
export interface Options {
  readonly chunkSize?: number;
}

/**
 * How many bytes of a sequence are kept under one key where a store states no size.
 *
 * **When to use**
 *
 * Use where a store resolves the option it was built with ({@link Options}), so what a program
 * stating nothing gets is stated once.
 *
 * **Details**
 *
 * It is 64 KiB, the size {@link Byte.stream} reads a sequence in by default.
 * A store keeping a sequence in chunks of it serves the chunks a reader asks for, without cutting
 * them again.
 *
 * @see {@link Options} for where the size is stated.
 * @stability stable
 * @category constants
 */
export const defaultChunkSize = 64 * 1024;

/**
 * A store of byte sequences, read back as a {@link Byte}.
 *
 * **When to use**
 *
 * Use to keep the bytes of a trajectory where reading them again is cheaper than reading them from
 * a storage, such as the frame of a trajectory.
 * Use as well to write them without holding the sequence whole.
 *
 * **Details**
 *
 * - `read` serves the bytes kept under an id as a {@link Byte}, and an id that holds nothing fails
 *   as a {@link ByteStoreError}.
 * - `write` gives the sink a sequence is written through, so its bytes are cut and kept as they are
 *   produced.
 * - `remove` drops what an id holds, and removes nothing where the id holds nothing.
 * - `has` says whether an id holds a sequence.
 *
 * Nothing but an id is asked of a caller.
 * How a sequence is cut is the store's to say ({@link Options}), and the keys its chunks are kept
 * under are read off the id.
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
 * @stability stable
 * @category services
 */
export interface ByteStore {
  /**
   * Serves the bytes kept under `id` as a {@link Byte}.
   *
   * What a read reaches is read out of the store and joined, and none of the other chunks are read.
   * An id that holds nothing fails as a {@link ByteStoreError}.
   *
   * The record an id holds when this runs is what the view serves, so a sequence written again
   * meanwhile is read as it was.
   * A chunk the view states that the store no longer holds fails the read rather than serving fewer
   * bytes.
   */
  readonly read: (id: string) => Effect.Effect<Byte<ByteStoreError>, ByteStoreError>;

  /**
   * The sink a sequence is written into `id` through.
   *
   * What is written is cut into chunks as it arrives, and a chunk is kept once it has arrived
   * whole.
   * A sequence is kept as it is produced, not once it has ended.
   * Nothing is held open between chunks, so the sink needs no scope of its own.
   *
   * What the id held is dropped before the first byte is written.
   * A write that ends before the sequence does leaves the id holding nothing.
   */
  readonly write: (
    id: string,
    options?: WriteOptions,
  ) => Sink.Sink<void, Uint8Array, never, ByteStoreError>;

  /**
   * Drops the chunks kept under `id` and the record naming them.
   */
  readonly remove: (id: string) => Effect.Effect<void, ByteStoreError>;

  /**
   * Says whether `id` holds a sequence.
   */
  readonly has: (id: string) => Effect.Effect<boolean, ByteStoreError>;
}

/**
 * The service a store of bytes is provided through.
 *
 * **When to use**
 *
 * Use to require a store of a program, and {@link layer}, {@link layerKVStore} or {@link make} to
 * provide it.
 *
 * **Details**
 *
 * What holds the bytes is a store of `effect/persistence` rather than a place of this package's.
 * A store is provided at the composition root of a program, and the bytes are reached through the
 * service alone.
 * Which store that is, such as memory or a file system, is the layer's to say.
 *
 * @see {@link ByteStore} for what the service gives.
 * @stability stable
 * @category tags
 */
export const ByteStore: Context.Service<ByteStore, ByteStore> = Context.Service<
  ByteStore,
  ByteStore
>()("trajs/utils/ByteStore");

/**
 * A failed read or write of a store, or an id that holds no sequence.
 *
 * **When to use**
 *
 * Use to tell the failure of a store apart from the failure of the bytes it was asked for.
 * A store that refused, that was cut short, or that holds nothing where an id was named fails as
 * this error.
 * Bytes that do not hold what the reader is reading fail as the reader's own error.
 *
 * **Details**
 *
 * `id` names the sequence the store was asked about, the one read or the one written.
 * `cause` is what the store failed with, as it reported it, such as the failure of the key/value
 * store underneath.
 *
 * @see {@link ByteStore} for what a sequence is read and written through.
 * @stability stable
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
 * Creates a store over a key/value store.
 *
 * **When to use**
 *
 * Use where a program holds the key/value store itself rather than requiring one from context.
 * Use as well to state the layer over a store at hand ({@link layerKVStore}).
 *
 * **Details**
 *
 * What the key/value store is given of a sequence is the chunks it is cut into rather than the
 * sequence itself ({@link Options}).
 * A sequence is held in the chunks of the size the store was built with, whatever the size the
 * bytes arrived in.
 *
 * @see {@link ByteStore} for what the store gives.
 * @see {@link layerKVStore} for the same store as a layer over a key/value store.
 * @stability stable
 * @category constructors
 */
export const make = (store: KeyValueStore.KeyValueStore, options?: Options): ByteStore =>
  keyValueStoreBytes(store, options);

/**
 * The store over the key/value store of `effect/persistence`.
 *
 * **When to use**
 *
 * Use to keep bytes in the store a program states, such as memory, a file system or a database.
 * A store is provided wherever the bytes are to live, and this reads and writes sequences over it.
 *
 * **Details**
 *
 * A sequence is kept as one record beside the chunks it is cut into, and both are named by the id
 * alone.
 * A store may hold sequences from more than one part of a program without them meeting.
 *
 * `options` states how a sequence is cut as it is written ({@link Options}).
 * The size a sequence was written with is read back from the store, so this reads a sequence
 * written by a store built with another size.
 *
 * @see {@link ByteStore} for the store this provides.
 * @see {@link layer} for the same store over the key/value store in memory.
 * @see {@link make} for the same store built over a store at hand.
 * @stability stable
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
 * The store held in the key/value store in memory.
 *
 * **When to use**
 *
 * Use where the bytes are kept for as long as the program runs and no longer, such as what a
 * reading of a trajectory keeps between its readings.
 * Provide {@link layerKVStore} instead where they are to outlive it.
 *
 * **Details**
 *
 * It is {@link layerKVStore} over `KeyValueStore.layerMemory`.
 * A sequence is kept in the chunks that store cuts it into ({@link Options}), and nothing of it is
 * left when the program ends.
 * Nothing else is required of a program, since the key/value store is this layer's own.
 *
 * @see {@link ByteStore} for the store this provides.
 * @see {@link layerKVStore} for the same store over a key/value store a program states.
 * @stability stable
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<ByteStore> =>
  layerKVStore(options).pipe(Layer.provide(KeyValueStore.layerMemory));

/**
 * The store in a temporary directory of the file system.
 *
 * **When to use**
 *
 * Use where the bytes a program keeps are too many to hold in memory for as long as it runs, such
 * as the frames of the trajectories it reads again and again.
 * Use as well where they are not to be found after it ends, since the system clears the directory.
 *
 * **Details**
 *
 * It is {@link layerKVStore} over `KeyValueStore.layerFileSystem` in a directory made by
 * `FileSystem.makeTempDirectoryScoped`.
 * The directory is named after `prefix`, which defaults to `"trajs-"`, and holds nothing but the
 * sequences written through the store.
 * It is removed when the scope closes.
 *
 * A sequence is cut into chunks of {@link defaultChunkSize} ({@link Options}).
 * Where another size is to be kept, state the store with {@link layerKVStore} over a directory of
 * the program's own.
 *
 * @see {@link ByteStore} for the store this provides.
 * @see {@link layer} for the same store held in memory.
 * @see {@link layerKVStore} for the same store over a key/value store a program states.
 * @stability stable
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
