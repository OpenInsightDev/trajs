/**
 * The caching behind {@link Cache.Service.cache}: the source of a trajectory read once, its
 * newest parts kept in memory, and the older ones written to the store as frames.
 *
 * What a cache read is kept by the trajectory's id, so a trajectory of an id it read is
 * not read again.
 *
 * The store holds frames rather than parts, and the cache answers with parts: what is
 * written is read back by the part's index, so a reader never reaches the store.
 *
 * Nothing here is published: a program reaches the caching through {@link Cache.Cache}.
 */

import { ByteStore } from "@trajs/utils";
import { Effect, Option, Stream } from "effect";

import type * as Cache from "#/Cache.ts";
import type * as Config from "#/Config.ts";
import { decodePart, encodePart } from "#/internal/exchange.ts";
import { attach, configOf } from "#/internal/trajectory.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/** How many parts the window may leave before the array holding it is cut down. */
const compactAt = 1024;

/** How many parts a cache keeps in memory: the stated capacity as a whole count, or `Infinity`. */
const capacityOf = (options: Cache.Options | undefined): number => {
  const capacity = options?.capacity;

  if (capacity === undefined || capacity === "unbounded" || Number.isNaN(capacity)) {
    return Infinity;
  }

  return Math.max(0, Math.floor(capacity));
};

/** The id the frame of the part at `index` is kept under. */
const keyOf = (id: string, index: number): string => `${id}/${index}`;

/**
 * Reads `trajectory` once and keeps every part of it, the newest `capacity` in memory and
 * the rest in `store`.
 *
 * A source that fails fails the reading, and so does a part that cannot be written.
 */
const fill = Effect.fn(function* <Id extends string, Config extends Config.AnyConfig, E, R>(
  store: ByteStore.ByteStore,
  capacity: number,
  trajectory: Trajectory.Trajectory<Id, Config, E, R>,
): Effect.fn.Return<
  Cache.Cached<Id, Config>,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.EncodingServices<Config>
> {
  const encode = encodePart<Config>(trajectory);
  const decode = decodePart<Config>(trajectory);

  /** The part at `index`, read out of the store and decoded. */
  const readAt = (index: number) =>
    Effect.gen(function* () {
      const bytes = yield* store
        .read(keyOf(trajectory.id, index))
        .pipe(Effect.flatMap((bytes) => bytes.readAlloc()));

      return yield* decode(bytes);
    });

  /** Writes the part at `index` to the store, as the frame a trajectory is carried in. */
  const spill = (index: number, part: Trajectory.Part<Config>) =>
    Effect.gen(function* () {
      const frame = yield* encode(part);
      const sink = store.write(keyOf(trajectory.id, index));

      yield* Stream.make(frame).pipe(Stream.run(sink));
    });

  // The parts the window holds, from `head` on, and the index the next part is given.
  let held: Array<Trajectory.Part<Config>> = [];
  let head = 0;
  let next = 0;

  // One pass keeps the newest parts and writes out the ones the window leaves.
  const spilled = yield* trajectory.pipe(
    Stream.mapAccumArray(
      () => undefined,
      (_state, parts) => {
        const out: Array<readonly [index: number, part: Trajectory.Part<Config>]> = [];

        for (const part of parts) {
          held.push(part);
          next += 1;

          const kept = held.length - head;
          const over = Math.max(0, kept - capacity);
          // The first part the window still holds is the one the over count starts at.
          const first = next - kept;

          for (let offset = 0; offset < over; offset += 1) {
            out.push([first + offset, held[head + offset]]);
          }

          head += over;
        }

        // The parts the window left are dropped, so the array holds the window alone.
        if (head > compactAt && head * 2 > held.length) {
          held = held.slice(head);
          head = 0;
        }

        return [undefined, out] as const;
      },
    ),
    Stream.mapEffect(([index, part]) => spill(index, part)),
    Stream.runCount,
  );

  const window = head === 0 ? held : held.slice(head);

  // The parts the window left are read back in the order they were written.
  const parts = Stream.concat(
    Stream.range(0, spilled - 1).pipe(Stream.mapEffect(readAt)),
    Stream.fromIterable(window),
  );

  const cached = attach<Id, Config>(trajectory.id, configOf<Config>(trajectory))(parts);

  return Object.assign(cached, {
    length: next,
    at: (index: number) =>
      index < 0 || index >= next
        ? Effect.succeed(Option.none<Trajectory.Part<Config>>())
        : index < spilled
          ? readAt(index).pipe(Effect.map(Option.some))
          : Effect.succeed(Option.some(window[index - spilled])),
  });
});

/**
 * The cache a store and a window make: every trajectory it read, by the id the trajectory
 * is named by, the newest parts in memory and the ones before them in the store.
 *
 * An id names one trajectory, so a trajectory of an id already read is answered with what
 * the first reading kept, and its source is not read again.
 */
export const make = (store: ByteStore.ByteStore, options?: Cache.Options): Cache.Service => {
  const capacity = capacityOf(options);

  // One reading per id, kept for as long as the cache lives.
  const kept = new Map<string, unknown>();

  return {
    cache: <Id extends string, Config extends Config.AnyConfig, E, R>(
      trajectory: Trajectory.Trajectory<Id, Config, E, R>,
    ): Effect.Effect<
      Cache.Cached<Id, Config>,
      E | TrajectoryError | ByteStore.ByteStoreError,
      R | Config.EncodingServices<Config>
    > =>
      Effect.suspend(() => {
        const held = kept.get(trajectory.id);

        if (held !== undefined) {
          // SAFETY: an id names one trajectory, so what was read is a reading of this one.
          return held as Effect.Effect<
            Cache.Cached<Id, Config>,
            E | TrajectoryError | ByteStore.ByteStoreError,
            R | Config.EncodingServices<Config>
          >;
        }

        return Effect.gen(function* () {
          const once = yield* fill(store, capacity, trajectory).pipe(Effect.cached);

          kept.set(trajectory.id, once);

          return yield* once.pipe(
            Effect.tapError(() =>
              Effect.sync(() => {
                // A reading that failed is not kept, so the next one reads its source again.
                if (kept.get(trajectory.id) === once) {
                  kept.delete(trajectory.id);
                }
              }),
            ),
          );
        });
      }),
  };
};
