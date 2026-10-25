/**
 * `Cache.Service.cache` reads a trajectory once.
 * The newest parts stay in memory.
 * The parts before them are written to the store.
 * Every later reading answers with the same parts, in the same order.
 */

import * as Cache from "@trajs/core/Cache";
import * as Config from "@trajs/core/Config";
import * as EventKit from "@trajs/core/EventKit";
import * as ExtraKit from "@trajs/core/ExtraKit";
import * as MetricKit from "@trajs/core/MetricKit";
import * as Prompt from "@trajs/core/Prompt";
import * as Toolkit from "@trajs/core/Toolkit";
import * as Trajectory from "@trajs/core/Trajectory";
import { ByteStore } from "@trajs/utils";
import { DateTime, Effect, Stream } from "effect";
import { expect, it } from "vite-plus/test";

const config = Config.config({
  stream: false,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
});

/** Spilled frames are stored under this id. */
const id = "01890a5d-ac96-774b-bcce-b302099a8058";

const at = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");

const part = Trajectory.parts(config);

const conversation = (count: number): ReadonlyArray<Trajectory.Part<typeof config>> => [
  part.mainSession(),
  ...Array.from({ length: count }, (_, index) =>
    part.prompt(Prompt.make(`message ${index}`), { timestamp: at }),
  ),
];

const trajectoryOf = (parts: ReadonlyArray<Trajectory.Part<typeof config>>) =>
  Trajectory.make(id, config)(Stream.fromIterable(parts));

/** Runs `program` against its own in-memory store and cache. */
const run = <A, E>(
  program: Effect.Effect<A, E, Cache.Cache | ByteStore.ByteStore>,
  options?: Cache.Options,
) =>
  program.pipe(
    Effect.provide(Cache.layerKVStore(options)),
    Effect.provide(ByteStore.layer()),
    Effect.runPromise,
  );

it("replays the parts of a trajectory on every reading", async () => {
  const parts = conversation(3);

  const { first, second, cached } = await run(
    Effect.gen(function* () {
      const cache = yield* Cache.Cache;
      const cached = yield* cache.cache(trajectoryOf(parts));

      return {
        cached,
        first: [...(yield* cached.pipe(Stream.runCollect))],
        second: [...(yield* cached.pipe(Stream.runCollect))],
      };
    }),
  );

  expect(first).toEqual(parts);
  expect(second).toEqual(parts);
  expect(cached.id).toBe(id);
  expect(cached.extrakit).toBe(config.extrakit);
});

it("keeps the newest parts in memory and writes the earlier ones to the store", async () => {
  const parts = conversation(4);

  const { held, read } = await run(
    Effect.gen(function* () {
      const store = yield* ByteStore.ByteStore;
      const cache = yield* Cache.Cache;
      const cached = yield* cache.cache(trajectoryOf(parts));

      const held = yield* Effect.forEach(parts, (_, index) => store.has(`${id}/${index}`), {
        discard: false,
      });

      return { held, read: [...(yield* cached.pipe(Stream.runCollect))] };
    }),
    { capacity: 2 },
  );

  expect(held).toEqual([true, true, true, false, false]);
  expect(read).toEqual(parts);
});

it("writes every part to the store where the window holds none", async () => {
  const parts = conversation(2);

  const { held, read } = await run(
    Effect.gen(function* () {
      const store = yield* ByteStore.ByteStore;
      const cache = yield* Cache.Cache;
      const cached = yield* cache.cache(trajectoryOf(parts));

      const held = yield* Effect.forEach(parts, (_, index) => store.has(`${id}/${index}`), {
        discard: false,
      });

      return { held, read: [...(yield* cached.pipe(Stream.runCollect))] };
    }),
    { capacity: 0 },
  );

  expect(held).toEqual([true, true, true]);
  expect(read).toEqual(parts);
});

it("reads its source once, however many times the cache is read", async () => {
  const parts = conversation(3);
  let pulls = 0;

  await run(
    Effect.gen(function* () {
      const source = Trajectory.make(
        id,
        config,
      )(Stream.fromIterable(parts).pipe(Stream.tap(() => Effect.sync(() => void (pulls += 1)))));

      const cache = yield* Cache.Cache;
      const cached = yield* cache.cache(source);

      yield* cached.pipe(Stream.runDrain);
      yield* cached.pipe(Stream.runDrain);
    }),
  );

  expect(pulls).toBe(parts.length);
});

it("states the window where the cache is built, not where a trajectory is read", async () => {
  const parts = conversation(2);

  const read = await run(
    Effect.gen(function* () {
      const cache = yield* Cache.Cache;
      const cached = yield* cache.cache(trajectoryOf(parts));

      return [...(yield* cached.pipe(Stream.runCollect))];
    }),
    { capacity: 1 },
  );

  expect(read).toEqual(parts);
});

it("fails where its source fails, before a cache is made", async () => {
  const error = await run(
    Effect.gen(function* () {
      const source = Trajectory.make(id, config)(Stream.fail("boom"));
      const cache = yield* Cache.Cache;

      return yield* cache.cache(source).pipe(Effect.flip);
    }),
  );

  expect(error).toBe("boom");
});
