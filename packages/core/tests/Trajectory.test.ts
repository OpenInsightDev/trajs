/**
 * `Trajectory.cache` as a reading of a trajectory a program can read again: one pass
 * keeps a window of parts in memory and writes the rest to the store, and every
 * reading after it answers with the same parts in the same order.
 */

import * as Config from "@trajs/core/Config";
import * as EventKit from "@trajs/core/EventKit";
import * as ExtraKit from "@trajs/core/ExtraKit";
import * as MetricKit from "@trajs/core/MetricKit";
import * as Prompt from "@trajs/core/Prompt";
import * as Toolkit from "@trajs/core/Toolkit";
import * as Trajectory from "@trajs/core/Trajectory";
import { ByteStore } from "@trajs/utils";
import { DateTime, Effect, Scope, Stream } from "effect";
import { expect, it } from "vite-plus/test";

/** The kits the trajectories below are built with: no tools, events, or metrics. */
const config = Config.config({
  stream: false,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
});

/** The id every trajectory below is named by, which is what its spilled frames are keyed under. */
const id = "01890a5d-ac96-774b-bcce-b302099a8058";

/** When the conversations below were produced. */
const at = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");

/** The builders of the parts below, under the config they are read with. */
const part = Trajectory.parts(config);

/** A conversation of `count` prompts, after the main session part that opens it. */
const conversation = (count: number): ReadonlyArray<Trajectory.Part<typeof config>> => [
  part.mainSession(),
  ...Array.from({ length: count }, (_, index) =>
    part.prompt(Prompt.make(`message ${index}`), { timestamp: at }),
  ),
];

/** The trajectory the parts given make, named by {@link id}. */
const trajectoryOf = (parts: ReadonlyArray<Trajectory.Part<typeof config>>) =>
  Trajectory.make(id, config)(Stream.fromIterable(parts));

/** What the trajectories below require besides the store: the scope a cache is made in. */
type Program<A, E> = Effect.Effect<A, E, ByteStore.ByteStore | Scope.Scope>;

/** Runs a program against a store of its own, so no test reads another's frames. */
const run = <A, E>(program: Program<A, E>) =>
  program.pipe(Effect.provide(ByteStore.layer()), Effect.scoped, Effect.runPromise);

it("replays the parts of a trajectory on every reading", async () => {
  const parts = conversation(3);

  const { first, second, cache } = await run(
    Effect.gen(function* () {
      const cache = yield* Trajectory.cache(trajectoryOf(parts));

      return {
        cache,
        first: [...(yield* cache.pipe(Stream.runCollect))],
        second: [...(yield* cache.pipe(Stream.runCollect))],
      };
    }),
  );

  expect(first).toEqual(parts);
  expect(second).toEqual(parts);
  expect(cache.id).toBe(id);
  expect(cache.extrakit).toBe(config.extrakit);
});

it("keeps the window in memory and writes the parts after it to the store", async () => {
  const parts = conversation(4);

  const { held, read } = await run(
    Effect.gen(function* () {
      const store = yield* ByteStore.ByteStore;
      const cache = yield* Trajectory.cache(trajectoryOf(parts), { capacity: 2 });

      const held = yield* Effect.forEach(parts, (_, index) => store.has(`${id}/${index}`), {
        discard: false,
      });

      return { held, read: [...(yield* cache.pipe(Stream.runCollect))] };
    }),
  );

  expect(held).toEqual([false, false, true, true, true]);
  expect(read).toEqual(parts);
});

it("writes every part to the store where the window holds none", async () => {
  const parts = conversation(2);

  const { held, read } = await run(
    Effect.gen(function* () {
      const store = yield* ByteStore.ByteStore;
      const cache = yield* Trajectory.cache(trajectoryOf(parts), { capacity: 0 });

      const held = yield* Effect.forEach(parts, (_, index) => store.has(`${id}/${index}`), {
        discard: false,
      });

      return { held, read: [...(yield* cache.pipe(Stream.runCollect))] };
    }),
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

      const cache = yield* Trajectory.cache(source);

      yield* cache.pipe(Stream.runDrain);
      yield* cache.pipe(Stream.runDrain);
    }),
  );

  expect(pulls).toBe(parts.length);
});

it("takes the capacity without the trajectory it is applied to", async () => {
  const parts = conversation(2);

  const read = await run(
    Effect.gen(function* () {
      const cache = yield* trajectoryOf(parts).pipe(Trajectory.cache({ capacity: 1 }));

      return [...(yield* cache.pipe(Stream.runCollect))];
    }),
  );

  expect(read).toEqual(parts);
});

it("fails where its source fails, before a cache is made", async () => {
  const error = await run(
    Effect.gen(function* () {
      const source = Trajectory.make(id, config)(Stream.fail("boom"));

      return yield* Trajectory.cache(source).pipe(Effect.flip);
    }),
  );

  expect(error).toBe("boom");
});
