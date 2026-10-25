import { ByteStore } from "@trajs/utils";
import { Effect, Option, Stream } from "effect";

import type * as Cache from "#/Cache.ts";
import type * as Config from "#/Config.ts";
import { decodePart, encodePart } from "#/internal/exchange.ts";
import { attach, configOf } from "#/internal/trajectory.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

const compactAt = 1024;

/** A missing, `unbounded`, or `NaN` capacity keeps every part. */
const capacityOf = (options: Cache.Options | undefined): number => {
  const capacity = options?.capacity;

  if (capacity === undefined || capacity === "unbounded" || Number.isNaN(capacity)) {
    return Infinity;
  }

  return Math.max(0, Math.floor(capacity));
};

const keyOf = (id: string, index: number): string => `${id}/${index}`;

const keep = Effect.fn(function* <Id extends string, Config extends Config.AnyConfig, E, R>(
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

  const readAt = (index: number) =>
    Effect.gen(function* () {
      const bytes = yield* store
        .read(keyOf(trajectory.id, index))
        .pipe(Effect.flatMap((bytes) => bytes.readAlloc()));

      return yield* decode(bytes);
    });

  const writeAt = (index: number, part: Trajectory.Part<Config>) =>
    Effect.gen(function* () {
      const frame = yield* encode(part);
      const sink = store.write(keyOf(trajectory.id, index));

      yield* Stream.make(frame).pipe(Stream.run(sink));
    });

  let parts: Array<Trajectory.Part<Config>> = [];
  let head = 0;
  let next = 0;

  const stored = yield* trajectory.pipe(
    Stream.mapAccumArray(
      () => undefined,
      (_state, batch) => {
        const out: Array<readonly [index: number, part: Trajectory.Part<Config>]> = [];

        for (const part of batch) {
          parts.push(part);
          next += 1;

          const kept = parts.length - head;
          const over = Math.max(0, kept - capacity);
          const first = next - kept;

          for (let offset = 0; offset < over; offset += 1) {
            out.push([first + offset, parts[head + offset]]);
          }

          head += over;
        }

        // Copying the window on every part would dominate the read.
        if (head > compactAt && head * 2 > parts.length) {
          parts = parts.slice(head);
          head = 0;
        }

        return [undefined, out] as const;
      },
    ),
    Stream.mapEffect(([index, part]) => writeAt(index, part)),
    Stream.runCount,
  );

  const window = head === 0 ? parts : parts.slice(head);

  const stream = Stream.concat(
    Stream.range(0, stored - 1).pipe(Stream.mapEffect(readAt)),
    Stream.fromIterable(window),
  );

  const cached = attach<Id, Config>(trajectory.id, configOf<Config>(trajectory))(stream);

  return Object.assign(cached, {
    length: next,
    at: (index: number) =>
      index < 0 || index >= next
        ? Effect.succeed(Option.none<Trajectory.Part<Config>>())
        : index < stored
          ? readAt(index).pipe(Effect.map(Option.some))
          : Effect.succeed(Option.some(window[index - stored])),
  });
});

export const make = (store: ByteStore.ByteStore, options?: Cache.Options): Cache.Service => {
  const capacity = capacityOf(options);

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
        const cached = kept.get(trajectory.id);

        if (cached !== undefined) {
          // SAFETY: an id names one trajectory, so the kept effect is that trajectory.
          return cached as Effect.Effect<
            Cache.Cached<Id, Config>,
            E | TrajectoryError | ByteStore.ByteStoreError,
            R | Config.EncodingServices<Config>
          >;
        }

        return Effect.gen(function* () {
          const once = yield* keep(store, capacity, trajectory).pipe(Effect.cached);

          kept.set(trajectory.id, once);

          return yield* once.pipe(
            Effect.tapError(() =>
              Effect.sync(() => {
                // A failed read is dropped, so the next one reads the source again.
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
