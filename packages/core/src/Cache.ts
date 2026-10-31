/**
 * Replayable trajectories backed by memory and a byte store.
 *
 * {@link Service.cache} reads a source once and returns a {@link Cached} trajectory.
 * {@link layer}, {@link layerFsTemp}, and {@link layerKVStore} choose the backing store.
 *
 * @stability stable
 */

import { ByteStore } from "@trajs/utils";
import { Context, Data, Effect, Formatter, Layer } from "effect";
import type { FileSystem, Path } from "effect";
import type { PlatformError } from "effect/PlatformError";

import type * as Config from "#/Config.ts";
import { make as serviceOf } from "#/internal/cache.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The in-memory window for each cached trajectory.
 *
 * **Details**
 *
 * `capacity` counts the newest parts kept in memory, not bytes.
 * Omission or `"unbounded"` keeps every part in memory.
 * Numeric capacities are rounded down and clamped to zero.
 * `NaN` also selects unbounded capacity.
 *
 * @see {@link make} for applying the window to a byte store.
 * @stability stable
 * @category configuration
 */
export interface Options {
  readonly capacity?: number | "unbounded";
}

/**
 * A backing-store failure while reading or writing a cached part.
 *
 * **When to use**
 *
 * Use to distinguish store failures from source errors and {@link TrajectoryError} decoding failures.
 *
 * **Details**
 *
 * `id` names the trajectory and `index` is the zero-based part index.
 * `cause` retains the store's original failure.
 *
 * @see {@link Cached} for replay and indexed access.
 * @stability stable
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
 * A replayable trajectory with a known length and indexed access.
 *
 * **Details**
 *
 * The value is a {@link Trajectory.Trajectory} and a
 * {@link Trajectory.TrajectoryBuffer} over the same parts.
 * Every reading replays those parts, and the source runs once.
 *
 * **Gotchas**
 *
 * Reads require the backing store to remain available.
 *
 * @see {@link Trajectory.TrajectoryBuffer} for `length` and `at`.
 * @see {@link Service.cache} for creating the cached trajectory.
 * @see {@link CacheError} for store failures.
 * @stability stable
 * @category models
 */
export type Cached<Id extends string, Config extends Config.AnyConfig> = Trajectory.Trajectory<
  Id,
  Config,
  TrajectoryError | CacheError,
  Config.DecodingServices<Config>
> &
  Trajectory.TrajectoryBuffer<
    Config,
    TrajectoryError | CacheError,
    Config.DecodingServices<Config>
  >;

/**
 * Service for caching trajectories by id.
 *
 * **When to use**
 *
 * Use when source streams cannot be rerun but their parts need repeated reads.
 *
 * @see {@link Cache} for the service tag.
 * @see {@link make} for construction without a layer.
 * @stability stable
 * @category services
 */
export interface Service {
  /**
   * Reads a trajectory to completion and retains its parts for replay.
   *
   * **Details**
   *
   * The newest parts stay in memory within the configured capacity.
   * Earlier parts are encoded into the backing store.
   * Repeated calls for an id reuse its cached reading.
   * A failed reading is removed, so a later call can retry.
   *
   * **Gotchas**
   *
   * An id must always identify the same parts and config.
   * Reusing an id for different input returns the earlier cached trajectory.
   * An infinite source never returns a cached result.
   *
   * @see {@link Cached} for replay and indexed access.
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
 * Creates a cache over an existing byte store.
 *
 * **When to use**
 *
 * Use when the caller manages the store's lifetime directly.
 *
 * @see {@link layerKVStore} for obtaining the store from context.
 * @see {@link Options} for the in-memory window.
 * @stability stable
 * @category constructors
 */
export const make = (store: ByteStore.ByteStore, options?: Options): Service =>
  serviceOf(store, options);

/**
 * Service tag for trajectory caching.
 *
 * @see {@link Service} for the caching contract.
 * @see {@link layer} for an in-memory provider.
 * @stability stable
 * @category tags
 */
export class Cache extends Context.Service<Cache, Service>()("trajs/core/Cache") {}

/**
 * Creates a layer using the byte store from context.
 *
 * **When to use**
 *
 * Use when the application supplies its own storage backend.
 *
 * @see {@link layer} for an in-memory backend.
 * @see {@link layerFsTemp} for a temporary filesystem backend.
 * @see {@link Options} for the in-memory window.
 * @stability stable
 * @category layers
 */
export const layerKVStore = (options?: Options): Layer.Layer<Cache, never, ByteStore.ByteStore> =>
  Layer.effect(Cache, ByteStore.ByteStore.pipe(Effect.map((store) => make(store, options))));

/**
 * Creates a cache layer with an in-memory byte store.
 *
 * **When to use**
 *
 * Use when cached trajectories fit in memory.
 *
 * **Gotchas**
 *
 * A finite capacity moves older parts into another in-memory representation, not onto disk.
 *
 * @see {@link layerFsTemp} for spilling parts to disk.
 * @see {@link layerKVStore} for a caller-supplied backend.
 * @stability stable
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<Cache> =>
  layerKVStore(options).pipe(Layer.provide(ByteStore.layer()));

/**
 * Creates a cache layer backed by a scoped temporary directory.
 *
 * **When to use**
 *
 * Use when older parts should spill to disk without persistent storage.
 *
 * **Details**
 *
 * The directory uses `prefix`, defaulting to `"trajs-"`, and is removed when the layer's scope closes.
 *
 * **Gotchas**
 *
 * Set a finite `capacity` to spill parts.
 * The default capacity keeps every part in memory, even with a filesystem backend.
 *
 * @see {@link layer} for an in-memory backend.
 * @see {@link Options} for the in-memory window.
 * @stability stable
 * @category layers
 */
export const layerFsTemp = (
  prefix = "trajs-",
  options?: Options,
): Layer.Layer<Cache, PlatformError, FileSystem.FileSystem | Path.Path> =>
  layerKVStore(options).pipe(Layer.provide(ByteStore.layerFsTemp(prefix)));
