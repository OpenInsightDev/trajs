import { ByteStore } from "@trajs/utils";
import { Context, Data, Effect, Formatter, Layer } from "effect";
import type { FileSystem, Option, Path } from "effect";
import type { PlatformError } from "effect/PlatformError";

import type * as Config from "#/Config.ts";
import { make as serviceOf } from "#/internal/cache.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The cache a trajectory is read through: a trajectory read once from its source and kept
 * to be read again, its newest parts in memory and the ones before them in a
 * {@link ByteStore.ByteStore}.
 *
 * A cache is asked for a trajectory rather than for bytes. {@link Service.cache} reads one
 * once and answers with a {@link Cached} trajectory, which reads its parts again as often
 * as a program asks and serves one at a time by its index. How a part is kept is the
 * cache's own, so a program reads parts and never frames.
 *
 * A trajectory is kept by its id, and an id names one trajectory: a trajectory of an id
 * the cache read is answered with what that reading kept, so its source is not read again.
 *
 * Where a cache lives is its layer's to say: in memory ({@link layer}), in a
 * temporary directory of the file system ({@link layerFsTemp}), or in the byte
 * store a program provides ({@link layerKVStore}).
 */

/**
 * What a cache is built with: how many of the newest parts it keeps in memory.
 *
 * **When to use**
 *
 * Use where a cache is built ({@link layer}, {@link layerFsTemp},
 * {@link layerKVStore}) and the window it holds matters.
 *
 * **Details**
 *
 * - `capacity` states how many of the newest parts of each trajectory are kept in memory,
 *   as a whole count. It defaults to `"unbounded"`: every part is kept and none is written
 *   to the store.
 *
 * @see {@link Service.cache} for the reading that uses the window.
 * @category models
 */
export interface Options {
  readonly capacity?: number | "unbounded";
}

/**
 * What a cache failed with: a part it could not read from or write to its store.
 *
 * **When to use**
 *
 * Use to tell the failure of the cache's store apart from the failure of the trajectory
 * it read: a store that refused or was cut short fails as this error, where bytes that
 * do not hold a part fail as a {@link TrajectoryError}.
 *
 * **Details**
 *
 * - `id` names the trajectory whose part could not be kept.
 * - `index` is the index of that part in the trajectory.
 * - `operation` says whether the part was being read or written.
 * - `cause` is what the store failed with, as it reported it.
 *
 * @see {@link Cached} for the trajectory whose parts are read.
 * @category errors
 */
export class CacheError extends Data.TaggedError("CacheError")<{
  id: string;
  index: number;
  operation: "read" | "write";
  cause: unknown;
}> {
  override get message(): string {
    return `Failed to ${this.operation} part ${this.index} of '${this.id}': ${Formatter.format(this.cause)}`;
  }
}

/**
 * A trajectory a cache keeps: the parts it read from the source, read again as often as
 * asked and served one at a time by their index.
 *
 * **Details**
 *
 * - `length` is how many parts the source held once the cache read it.
 * - `at` serves the part at an index, out of memory or the store, and `none` where the
 *   trajectory held fewer parts.
 * - It is read for as long as the cache lives.
 *
 * @see {@link Service.cache} for the reading that keeps a trajectory.
 * @see {@link CacheError} for a part the store could not serve or keep.
 * @category models
 */
export type Cached<Id extends string, Config extends Config.AnyConfig> = Trajectory.Trajectory<
  Id,
  Config,
  TrajectoryError | CacheError,
  Config.DecodingServices<Config>
> &
  Readonly<{
    readonly length: number;
    readonly at: (
      index: number,
    ) => Effect.Effect<
      Option.Option<Trajectory.Part<Config>>,
      TrajectoryError | CacheError,
      Config.DecodingServices<Config>
    >;
  }>;

/**
 * What a cache gives: the trajectories it keeps, each read once from its source.
 *
 * **When to use**
 *
 * Use to require a cache of a program, and {@link make}, {@link layer},
 * {@link layerFsTemp} or {@link layerKVStore} to provide it.
 *
 * @see {@link Cached} for a trajectory it keeps.
 * @category models
 */
export interface Service {
  /**
   * Reads `trajectory` once and keeps it, answering with the trajectory to read again.
   *
   * **Details**
   *
   * The source is read once. The newest parts within the cache's window are kept in
   * memory, and the ones before them are written to the store as frames, named by the
   * trajectory's id and the part's index. A part the window left is read back and decoded
   * with the trajectory's own config, and a source that fails fails the reading.
   *
   * The trajectory is kept by its id, and an id names one trajectory, so a trajectory of
   * an id the cache read is answered with what that reading kept: its source is not read
   * again. A reading that failed is not kept, so the next one reads the source again.
   *
   * The parts a cache kept are read for as long as the cache lives.
   *
   * @see {@link Cached} for the trajectory it answers with.
   */
  readonly cache: <Id extends string, Config extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<Id, Config, E, R>,
  ) => Effect.Effect<
    Cached<Id, Config>,
    E | TrajectoryError | CacheError,
    R | Config.EncodingServices<Config>
  >;
}

/**
 * A cache over the store given: the newest parts kept in memory, and the ones before them
 * written to that store.
 *
 * **When to use**
 *
 * Use where a program holds the store itself rather than requiring a cache over one
 * ({@link layerKVStore}).
 *
 * @see {@link Service} for the cache this makes.
 * @category constructors
 */
export const make = (store: ByteStore.ByteStore, options?: Options): Service =>
  serviceOf(store, options);

/**
 * The cache a program reads trajectories through: the store the parts are kept in, the
 * window of them kept in memory, and the trajectories it read, by the id each is named by.
 *
 * **When to use**
 *
 * Use to require a cache of a program, and {@link make}, {@link layer},
 * {@link layerFsTemp} or {@link layerKVStore} to provide it.
 *
 * @see {@link Service} for what the cache gives.
 * @see {@link Cached} for a trajectory a cache keeps.
 * @category services
 */
export class Cache extends Context.Service<Cache, Service>()("trajs/core/Cache") {}

/**
 * A cache over the byte store a program provides.
 *
 * **When to use**
 *
 * Use to keep the parts outside the window in a store a program states — memory, a
 * file system, a database — without naming one of them here.
 *
 * @see {@link Service} for the cache this provides.
 * @see {@link layer} for the same cache over a byte store in memory.
 * @category layers
 */
export const layerKVStore = (options?: Options): Layer.Layer<Cache, never, ByteStore.ByteStore> =>
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
 * @see {@link layerKVStore} for the same cache over a byte store a program states.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<Cache> =>
  layerKVStore(options).pipe(Layer.provide(ByteStore.layer()));

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
 * It is {@link layerKVStore} over `ByteStore.layerFsTemp`, in a directory named
 * after `prefix` and defaulting to `"trajs-"`. Nothing of it is left behind when the
 * scope closes.
 *
 * @see {@link Service} for the cache this provides.
 * @see {@link layer} for the same cache held in memory.
 * @category layers
 */
export const layerFsTemp = (
  prefix = "trajs-",
  options?: Options,
): Layer.Layer<Cache, PlatformError, FileSystem.FileSystem | Path.Path> =>
  layerKVStore(options).pipe(Layer.provide(ByteStore.layerFsTemp(prefix)));
