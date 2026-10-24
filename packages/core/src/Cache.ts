/**
 * The cache a trajectory is read through: the newest parts of a trajectory held in
 * memory, and the ones before them written to a {@link ByteStore.ByteStore}.
 *
 * A cache is read as often as a program asks for it, and its source is read once: the
 * first reading keeps the parts within the window and writes the rest out as frames,
 * and every reading after it answers with the same parts in the same order.
 *
 * Where a cache lives is its layer's to say: in memory ({@link Cache.layer}), in a
 * temporary directory of the file system ({@link Cache.layerFsTemp}), or in the byte
 * store a program provides ({@link Cache.layerKVStore}).
 */

import { ByteStore } from "@trajs/utils";
import { Context, Effect, Layer } from "effect";
import type { FileSystem, Path } from "effect";
import type { PlatformError } from "effect/PlatformError";

import type * as Config from "#/Config.ts";
import { cached, capacityOf } from "#/internal/cache.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * What a cache is built with: how many of the newest parts it keeps in memory.
 *
 * **When to use**
 *
 * Use where a cache is built ({@link Cache.layer}, {@link Cache.layerFsTemp},
 * {@link Cache.layerKVStore}) and the window it holds matters.
 *
 * **Details**
 *
 * - `capacity` states how many of the newest parts are kept in memory, as a whole
 *   count. It defaults to `"unbounded"`: every part is kept and none is written to the
 *   store.
 *
 * @see {@link cache} for the reading that uses the window.
 * @category models
 */
export interface Options {
  readonly capacity?: number | "unbounded";
}

/**
 * What a cache gives: the store the parts outside its window are written to, and how
 * many of the newest parts are kept in memory.
 *
 * **Details**
 *
 * - `store` holds the parts outside the window, under the trajectory's id and the
 *   part's index, so a reading of the store serves the same part again.
 * - `capacity` is how many parts the window holds, or `Infinity` where it holds every
 *   part.
 *
 * @see {@link cache} for the reading that fills and serves it.
 * @category models
 */
export interface Service {
  readonly store: ByteStore.ByteStore;
  readonly capacity: number;
}

/**
 * A cache over the store given: the parts outside the window are written to that store.
 *
 * **When to use**
 *
 * Use where a program holds the store itself rather than requiring a cache over one
 * ({@link Cache.layerKVStore}).
 *
 * @see {@link Service} for what the cache gives.
 * @category constructors
 */
export const make = (store: ByteStore.ByteStore, options?: Options): Service => ({
  store,
  capacity: capacityOf(options),
});

/**
 * The cache a program reads trajectories through: the store and window a reading keeps
 * its parts in.
 *
 * **When to use**
 *
 * Use to require a cache of a program, and {@link make}, {@link Cache.layer},
 * {@link Cache.layerFsTemp} or {@link Cache.layerKVStore} to provide it.
 *
 * @see {@link Service} for what the cache gives.
 * @category services
 */
export class Cache extends Context.Service<Cache, Service>()("trajs/core/Cache") {
  /**
   * A cache over the byte store a program provides.
   *
   * **When to use**
   *
   * Use to keep the parts outside the window in a store a program states — memory, a
   * file system, a database — without naming one of them here.
   *
   * @see {@link Service} for the cache this provides.
   * @see {@link Cache.layer} for the same cache over a byte store in memory.
   * @category layers
   */
  static readonly layerKVStore = (
    options?: Options,
  ): Layer.Layer<Cache, never, ByteStore.ByteStore> =>
    Layer.effect(Cache, ByteStore.ByteStore.pipe(Effect.map((store) => make(store, options))));

  /**
   * The cache this package ships where a program states nothing: the parts outside the
   * window in a byte store in memory.
   *
   * **When to use**
   *
   * Use where the parts are kept for as long as the program runs and no longer — what a
   * reading of a trajectory keeps between its readings, say.
   *
   * @see {@link Service} for the cache this provides.
   * @see {@link Cache.layerKVStore} for the same cache over a byte store a program
   * states.
   * @category layers
   */
  static readonly layer = (options?: Options): Layer.Layer<Cache> =>
    Cache.layerKVStore(options).pipe(Layer.provide(ByteStore.layer()));

  /**
   * The cache this package ships in a temporary directory of the file system: the parts
   * outside the window kept in a directory made when the layer is built and removed when
   * the scope it was built in closes.
   *
   * **When to use**
   *
   * Use where the parts a program keeps are too many to hold in memory for as long as it
   * runs, and are not to be found after it ends.
   *
   * **Details**
   *
   * It is {@link Cache.layerKVStore} over `ByteStore.layerFsTemp`, in a directory named
   * after `prefix` and defaulting to `"trajs-"`. Nothing of it is left behind when the
   * scope closes.
   *
   * @see {@link Service} for the cache this provides.
   * @see {@link Cache.layer} for the same cache held in memory.
   * @category layers
   */
  static readonly layerFsTemp = (
    prefix = "trajs-",
    options?: Options,
  ): Layer.Layer<Cache, PlatformError, FileSystem.FileSystem | Path.Path> =>
    Cache.layerKVStore(options).pipe(Layer.provide(ByteStore.layerFsTemp(prefix)));
}

/**
 * Reads a trajectory through the cache a program provides, so every reading after the
 * first answers with the same parts in the same order.
 *
 * **When to use**
 *
 * Use to read a trajectory more than once without reading its source more than once —
 * a session reading its parts again as often as it is asked for, say.
 *
 * **Details**
 *
 * The source is read once. The first reading keeps the parts within the cache's window
 * in memory and writes the rest to its store as frames, named by the trajectory's id
 * and the part's index. A part the window left is read back from the store in the order
 * it was written, and a source that fails fails before a cache is made.
 *
 * @see {@link Service} for the window and the store the parts are kept in.
 * @category constructors
 */
export const cache = Effect.fn(function* <Id extends string, Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<Id, Config, E, R>,
): Effect.fn.Return<
  Trajectory.Trajectory<
    Id,
    Config,
    TrajectoryError | ByteStore.ByteStoreError,
    Config.DecodingServices<Config>
  >,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Cache | Config.EncodingServices<Config>
> {
  const service = yield* Cache;

  return yield* cached(service, trajectory);
});
