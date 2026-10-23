/**
 * The reading behind `Trajectory.cache`: one pass over a trajectory, its parts kept as they
 * arrive so that the trajectory reads again — from its first part, whenever a reader starts.
 *
 * What it keeps is a window of the newest parts in memory, and the parts that window has left as
 * the frames a trajectory is carried in, in the store of bytes a program provides: a trajectory
 * longer than the window is held whole without being held in memory.
 *
 * Nothing here is published: a program reaches the reading through `Trajectory.cache`.
 */

import { ByteStore, type ByteStoreError } from "@trajs/utils/ByteStore";
import { Cause, Deferred, Effect, HashMap, Option, Ref, Scope, Stream } from "effect";
import * as uuid from "uuid";

import * as Config from "#/Config.ts";
import {
  configOf,
  decodePart,
  encodePart,
  type EncodingServices,
  type Readable,
} from "#/internal/parts.ts";
import { attach } from "#/internal/trajectory.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

const everyPart = Infinity;

/**
 * What a cache has of the trajectory it reads: the parts it has produced, and the newest of
 * them as they are kept in memory.
 */
interface Cache<Config extends Config.AnyConfig> {
  /** How many parts the reading has produced: the index the part after them is produced at. */
  readonly produced: number;
  /** The parts kept in memory, by the index each was produced at. */
  readonly kept: HashMap.HashMap<number, Trajectory.Part<Config>>;
}

/**
 * What a cache does with the parts that leave the window: writes them into the store, and reads
 * them back where a reader asks for one that is no longer in memory.
 */
interface Spilled<Config extends Config.AnyConfig> {
  readonly write: (
    index: number,
    part: Trajectory.Part<Config>,
  ) => Effect.Effect<void, TrajectoryError | ByteStoreError, EncodingServices<Config>>;
  readonly read: (
    index: number,
  ) => Effect.Effect<Trajectory.Part<Config>, TrajectoryError | ByteStoreError>;
}

/** How many parts a cache keeps in memory: the capacity stated, as the number an unbounded one is. */
const capacityOf = (options?: Trajectory.CacheOptions): number => {
  const capacity = options?.capacity ?? "unbounded";

  return capacity === "unbounded" ? everyPart : Math.max(0, Math.floor(capacity));
};

/**
 * Caches the trajectory given: the parts of one reading of it are kept, so that the trajectory
 * reads again — from its first part, whenever a reader starts.
 */
export const cached = <Id extends string, Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<Id, Config, E, R> & Readable<Config>,
  options?: Trajectory.CacheOptions,
): Effect.Effect<
  Trajectory.Trajectory<Id, Config, E | TrajectoryError | ByteStoreError, never>,
  E | TrajectoryError | ByteStoreError,
  Scope.Scope | R | EncodingServices<Config> | ByteStore
> =>
  Effect.gen(function* () {
    const config = configOf(trajectory);
    const capacity = capacityOf(options);
    const store = yield* ByteStore;

    // The store is the program's and keeps the bytes of more than this cache, so a cache writes
    // under keys of its own: a part is named by the index it was produced at.
    const prefix = `cache/${uuid.v7()}`;
    const keyOf = (index: number): string => `${prefix}/${index}`;

    /** The keys this cache wrote, which are removed with the scope. */
    const written: Array<string> = [];

    // What a cache wrote is its own rather than the program's to keep, so it is removed with the
    // scope. Finalizers run in reverse order, so this runs after the reading of the source is
    // stopped, and the last part written is covered as well.
    yield* Effect.addFinalizer(() =>
      Effect.forEach(written, (key) => store.remove(key).pipe(Effect.ignore), { discard: true }),
    );

    // The schemas a part is written and read as are built once, since every part that leaves the
    // window goes through them.
    const encode = encodePart(config);
    const decode = decodePart(config);

    const spilled: Spilled<Config> = {
      write: (index, part) =>
        Effect.gen(function* () {
          const key = keyOf(index);
          const frame = yield* encode(part);

          // The key is remembered before its bytes are written, so what a write that failed
          // halfway left in the store is removed with the scope as well.
          written.push(key);

          yield* Stream.make(frame).pipe(Stream.run(store.write(key)));
        }),
      read: (index) =>
        store.read(keyOf(index)).pipe(Effect.flatMap((bytes) => decode(bytes.stream()))),
    };

    const cache = yield* Ref.make<Cache<Config>>({ produced: 0, kept: HashMap.empty() });

    /** What the reading of the source ended with, once it has: a success is an end of its own. */
    const ending = yield* Deferred.make<void, E | TrajectoryError | ByteStoreError>();

    /** The next part a reader waits for: completed — and replaced — as a part arrives. */
    const waiting = yield* Ref.make(yield* Deferred.make<void>());

    const arrived = Effect.gen(function* () {
      const woken = yield* Ref.getAndSet(waiting, yield* Deferred.make<void>());

      yield* Deferred.succeed(woken, void 0);
    });

    /**
     * The part at `index` as it is kept: the one in memory where the window holds it, and the one
     * written into the store where it was the part that left it.
     */
    const held = (
      state: Cache<Config>,
      index: number,
    ): Effect.Effect<Trajectory.Part<Config>, TrajectoryError | ByteStoreError> =>
      Option.match(HashMap.get(state.kept, index), {
        onSome: Effect.succeed,
        onNone: () => spilled.read(index),
      });

    /**
     * Keeps the part the source produced: in the window where it fits, and in the store where it
     * is the one the window no longer holds.
     */
    const keep = (
      part: Trajectory.Part<Config>,
    ): Effect.Effect<void, TrajectoryError | ByteStoreError, EncodingServices<Config>> =>
      Effect.gen(function* () {
        const state = yield* Ref.get(cache);
        const index = state.produced;
        const kept = HashMap.set(state.kept, index, part);
        /** The index of the part the window no longer holds, where it no longer holds one. */
        const leaving = index - capacity;

        if (leaving >= 0) {
          // The window holds the `capacity` parts before the one appended, so the part it leaves
          // is one of them — and it is written before the window states the parts after it, so a
          // reader that reads it out of the store finds it there.
          yield* spilled.write(leaving, Option.getOrThrow(HashMap.get(kept, leaving)));
          yield* Ref.set(cache, { produced: index + 1, kept: HashMap.remove(kept, leaving) });
        } else {
          yield* Ref.set(cache, { produced: index + 1, kept });
        }

        yield* arrived;
      });

    // The source is read as soon as the trajectory is cached rather than as a reader asks for a
    // part: what is kept does not depend on a reader being there to ask for it, so a reader that
    // starts at any time — after the trajectory ended, or with none of it read yet — reads it
    // whole.
    yield* trajectory.pipe(
      Stream.runForEach(keep),
      Effect.exit,
      Effect.flatMap((exit) =>
        Effect.gen(function* () {
          yield* Deferred.done(ending, exit);
          yield* arrived;
        }),
      ),
      Effect.forkScoped,
    );

    /**
     * The part produced at `index`, once it has been: what the reading kept, and what is still to
     * arrive, which a reader waits for.
     */
    const at = (
      index: number,
    ): Effect.Effect<
      Trajectory.Part<Config>,
      Cause.Done<void> | E | TrajectoryError | ByteStoreError
    > =>
      Effect.gen(function* () {
        while (true) {
          // The arrival this reader waits for is taken before the cache is read, so a part that
          // arrives while the one asked for is looked for completes a waiter this reader holds.
          const next = yield* Ref.get(waiting);
          const state = yield* Ref.get(cache);

          if (index < state.produced) {
            return yield* held(state, index);
          }

          const ended = yield* Deferred.poll(ending);

          if (Option.isSome(ended)) {
            // The reading states its end after the parts it kept, so a part produced last is one
            // the cache holds by the time this reader reads it here.
            const last = yield* Ref.get(cache);

            if (index < last.produced) {
              return yield* held(last, index);
            }

            // A reading that ended leaves a reader at its own end, and one that failed fails it.
            yield* ended.value;

            return yield* Cause.done();
          }

          yield* Deferred.await(next);
        }
      });

    const parts = Stream.fromPull(
      Effect.sync(() => {
        // The index of the part a reading is at: its own, so a reader that starts later reads
        // the trajectory from its first part rather than from where another one is.
        let index = 0;

        return Effect.gen(function* () {
          const part = yield* at(index);
          index += 1;

          return [part] as const;
        });
      }),
    );

    // SAFETY: the config the reading is of is the one the trajectory was made with — read off it
    // rather than stated again — and its parts are the ones that reading produces, so what is
    // returned reads as the trajectory it was given.
    return attach(trajectory.id, config)(parts) as Trajectory.Trajectory<
      Id,
      Config,
      E | TrajectoryError | ByteStoreError,
      never
    >;
  });
