/**
 * Replayable trajectories backed by memory and a key/value store.
 *
 * {@link Cache.cache} reads a source once and returns a {@link Trajectory.TrajectoryFile}.
 * {@link layerMemory} and {@link layerKVStore} choose the backing store.
 *
 * @stability stable
 */

import { Context, Data, Effect, Formatter, Layer, Option, Stream } from "effect";
import * as EffectCache from "effect/Cache";
import { KeyValueStore } from "effect/persistence";

import type * as Config from "#/Config.ts";
import { decodePart, encodePart } from "#/internal/exchange/part.ts";
import { configOf } from "#/internal/trajectory.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A backing-store failure while reading or writing a cached part.
 *
 * **Details**
 *
 * `id` names the trajectory and `index` is the zero-based index of the part.
 * `cause` retains the failure of the store.
 *
 * @see {@link layerKVStore} for the store these failures come from.
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
 * A cache reading a trajectory once and keeping its parts for replay.
 *
 * **When to use**
 *
 * Use when a source stream cannot be rerun, and its parts are read again.
 *
 * @see {@link layerMemory} for a cache holding every part in memory.
 * @see {@link layerKVStore} for a cache holding its parts in a store.
 * @stability stable
 * @category services
 */
export interface Cache {
  readonly cache: <Id extends string, Config extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<Id, Config, E, R>,
  ) => Effect.Effect<
    Trajectory.TrajectoryFile<
      Id,
      Config,
      TrajectoryError | CacheError,
      Config.DecodingServices<Config>
    >,
    E | TrajectoryError | CacheError,
    R | Config.EncodingServices<Config>
  >;
}

/**
 * The service a cache is provided through.
 *
 * @see {@link Cache} for what the service gives.
 * @stability stable
 * @category tags
 */
export const Cache = Context.Service<Cache, Cache>()("trajs/core/Cache");

/**
 * Creates a cache keeping its least recently read parts in memory.
 *
 * **When to use**
 *
 * Use when cached parts must outlive the program, or are too many to hold.
 *
 * **Details**
 *
 * `capacity` is the size of the memory, counted in parts rather than bytes.
 * A part read again is the last to be dropped, and omission or `"unbounded"`
 * holds every part.
 * Reading the source runs to its end, and every part is encoded and kept under
 * `<id>/<index>`.
 * `at` decodes a part from the store, and keeps it from then on.
 *
 * **Gotchas**
 *
 * An id names the keys of its parts, so reading one trajectory over another's id
 * reads that one's parts.
 * A part kept again is written over the one the store held.
 *
 * @see {@link layerMemory} for a cache holding every part in memory.
 * @stability stable
 * @category layers
 */
export const layerKVStore = (options?: {
  readonly capacity?: number | "unbounded";
}): Layer.Layer<Cache, never, KeyValueStore.KeyValueStore> => {
  const stated = options?.capacity;

  const capacity =
    stated === undefined || stated === "unbounded" ? Infinity : Math.max(0, Math.floor(stated));

  return Layer.effect(
    Cache,
    Effect.gen(function* () {
      const store = yield* KeyValueStore.KeyValueStore;

      return {
        cache: <Id extends string, Config extends Config.AnyConfig, E, R>(
          trajectory: Trajectory.Trajectory<Id, Config, E, R>,
        ) =>
          Effect.gen(function* () {
            const config = configOf<Config>(trajectory);
            const encode = encodePart<Config>(config);
            const decode = decodePart<Config>(config);

            const parts = yield* EffectCache.make({
              capacity,
              requireServicesAt: "lookup",
              lookup: (index: number) =>
                Effect.gen(function* () {
                  const bytes = yield* store.getUint8Array(`${trajectory.id}/${index}`).pipe(
                    Effect.mapError(
                      (cause) =>
                        new CacheError({
                          id: trajectory.id,
                          index,
                          operation: "read",
                          cause,
                        }),
                    ),
                  );

                  if (bytes === undefined) {
                    return yield* Effect.fail(
                      new CacheError({
                        id: trajectory.id,
                        index,
                        operation: "read",
                        cause: "the store holds no part at this index",
                      }),
                    );
                  }

                  return yield* decode(bytes);
                }),
            });

            let length = 0;

            yield* trajectory.pipe(
              Stream.mapEffect((part) => {
                const index = length;

                length += 1;

                return encode(part).pipe(
                  Effect.flatMap((bytes) =>
                    store.set(`${trajectory.id}/${index}`, bytes).pipe(
                      Effect.mapError(
                        (cause) =>
                          new CacheError({
                            id: trajectory.id,
                            index,
                            operation: "write",
                            cause,
                          }),
                      ),
                    ),
                  ),
                );
              }),
              Stream.runDrain,
            );

            return {
              ...config,
              id: trajectory.id,
              length,
              at: (index: number) =>
                index < 0 || index >= length
                  ? Effect.succeed(Option.none<Trajectory.Part<Config>>())
                  : EffectCache.get(parts, index).pipe(Effect.map(Option.some)),
            };
          }),
      };
    }),
  );
};

/**
 * Reads a trajectory into a buffer of its parts, kept in memory.
 *
 * **Details**
 *
 * Reading the source runs through to its end before the buffer is returned.
 * `length` counts the parts held, and `at` reads one by a zero-based index.
 *
 * @see {@link Trajectory.TrajectoryFile} for the buffer.
 * @stability stable
 * @category layers
 */
export const layerMemory: Layer.Layer<Cache> = Layer.effect(
  Cache,
  Effect.succeed({
    cache: <Id extends string, Config extends Config.AnyConfig, E, R>(
      trajectory: Trajectory.Trajectory<Id, Config, E, R>,
    ) =>
      trajectory.pipe(
        Stream.runCollect,
        Effect.map((parts): Trajectory.TrajectoryFile<Id, Config, never, never> => ({
          ...configOf<Config>(trajectory),
          id: trajectory.id,
          length: parts.length,
          at: (index) => Effect.succeed(Option.fromUndefinedOr(parts[index])),
        })),
      ),
  }),
);
