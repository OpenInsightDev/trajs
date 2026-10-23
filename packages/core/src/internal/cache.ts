import { ByteStore } from "@trajs/utils";
import { Effect, Scope, Stream } from "effect";

import type * as Config from "#/Config.ts";
import { decodePart, encodePart } from "#/internal/exchange.ts";
import { attach } from "#/internal/trajectory.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/** How many parts a cache keeps in memory: the stated capacity as a whole count, or `Infinity`. */
const capacityOf = ({ capacity }: Trajectory.CacheOptions): number => {
  if (capacity === undefined || capacity === "unbounded" || Number.isNaN(capacity)) {
    return Infinity;
  }

  return Math.max(0, Math.floor(capacity));
};

export const cache = Effect.fn(function* <Id extends string, Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<Id, Config, E, R>,
  options: Trajectory.CacheOptions = {},
): Effect.fn.Return<
  Trajectory.Trajectory<Id, Config, E | TrajectoryError | ByteStore.ByteStoreError>,
  E | TrajectoryError | ByteStore.ByteStoreError,
  Scope.Scope | R | ByteStore.ByteStore | Config.SchemaServices<Config>
> {
  const capacity = capacityOf(options);
  const store = yield* ByteStore.ByteStore;

  const keyOf = (index: number): string => `${trajectory.id}/${index}`;

  // The schemas a spilled part is written and read with, built where one first spills.
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

      // SAFETY: the exchange holds a response part as the stream part a trajectory does.
      return (yield* decode(bytes)) as Trajectory.Part<Config>;
    });

  // One pass keeps the parts within the window and writes the rest out as frames.
  const kept: Array<Trajectory.Part<Config>> = [];

  // SAFETY: a part is encoded with the config's schemas, whose services the signature states.
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
  ) as Effect.Effect<
    number,
    E | TrajectoryError | ByteStore.ByteStoreError,
    R | ByteStore.ByteStore | Config.SchemaServices<Config>
  >;

  const total = kept.length + spilledCount;

  // The parts the window left are read back in the order they were written.
  const parts = Stream.concat(
    Stream.fromIterable(kept),
    Stream.range(capacity, total - 1).pipe(Stream.mapEffect(read)),
  );

  // A trajectory carries the stream its parts arrive in, which a config does not state.
  // SAFETY: every field a config states is read off the trajectory, which carries one.
  const carried = {
    stream: trajectory.stream,
    toolkit: trajectory.toolkit,
    eventkit: trajectory.eventkit,
    metrickit: trajectory.metrickit,
    extrakit: trajectory.extrakit,
  } as Config;

  // SAFETY: a cached trajectory is read with the store and the config it was made with.
  return attach<Config>(trajectory.id, carried)(parts) as Trajectory.Trajectory<
    Id,
    Config,
    E | TrajectoryError | ByteStore.ByteStoreError
  >;
});
