/**
 * The caching behind {@link Cache.cache}: the parts within a cache's window kept in
 * memory, and the rest written to its store as frames.
 *
 * Nothing here is published: a program reaches the reading through {@link Cache.cache}.
 */

import { ByteStore } from "@trajs/utils";
import { Effect, Stream } from "effect";

import type * as Cache from "#/Cache.ts";
import type * as Config from "#/Config.ts";
import { decodePart, encodePart } from "#/internal/exchange.ts";
import { attach, configOf } from "#/internal/trajectory.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/** How many parts a cache keeps in memory: the stated capacity as a whole count, or `Infinity`. */
export const capacityOf = (options: Cache.Options | undefined): number => {
  const capacity = options?.capacity;

  if (capacity === undefined || capacity === "unbounded" || Number.isNaN(capacity)) {
    return Infinity;
  }

  return Math.max(0, Math.floor(capacity));
};

/**
 * The reading behind {@link Cache.cache}: the source read once, the parts within the
 * window kept in memory, and the rest written out and read back from the store.
 */
export const cached = Effect.fn(function* <
  Id extends string,
  Config extends Config.AnyConfig,
  E,
  R,
>(
  cache: Cache.Service,
  trajectory: Trajectory.Trajectory<Id, Config, E, R>,
): Effect.fn.Return<
  Trajectory.Trajectory<
    Id,
    Config,
    TrajectoryError | ByteStore.ByteStoreError,
    Config.DecodingServices<Config>
  >,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.EncodingServices<Config>
> {
  const { capacity, store } = cache;

  const keyOf = (index: number): string => `${trajectory.id}/${index}`;

  const codecs = yield* Effect.sync(() => ({
    encode: encodePart<Config>(trajectory),
    decode: decodePart<Config>(trajectory),
  })).pipe(Effect.cached);

  const spill = (index: number, part: Trajectory.Part<Config>) =>
    Effect.gen(function* () {
      const { encode } = yield* codecs;
      const frame = yield* encode(part);
      const sink = store.write(keyOf(index));

      yield* Stream.make(frame).pipe(Stream.run(sink));
    });

  const read = (index: number) =>
    Effect.gen(function* () {
      const { decode } = yield* codecs;

      const bytes = yield* store
        .read(keyOf(index))
        .pipe(Effect.flatMap((bytes) => bytes.readAlloc()));

      return yield* decode(bytes);
    });

  // One pass keeps the parts within the window and writes the rest out as frames.
  const kept: Array<Trajectory.Part<Config>> = [];

  const spilledCount = yield* trajectory.pipe(
    Stream.mapAccumArray(
      () => 0,
      (index, parts) => {
        const out: Array<readonly [index: number, part: Trajectory.Part<Config>]> = [];
        let at = index;

        for (const part of parts) {
          if (at < capacity) kept.push(part);
          else out.push([at, part]);
          at += 1;
        }

        return [at, out] as const;
      },
    ),
    Stream.mapEffect(([index, part]) => spill(index, part)),
    Stream.runCount,
  );

  const total = kept.length + spilledCount;

  // The parts the window left are read back in the order they were written.
  const parts = Stream.concat(
    Stream.fromIterable(kept),
    Stream.range(capacity, total - 1).pipe(Stream.mapEffect(read)),
  );

  return attach<Id, Config>(trajectory.id, configOf<Config>(trajectory))(parts);
});
