/**
 * The reading behind {@link Trajectory.toSessions}: one pass over a trajectory keeps its parts
 * in a store of bytes, so that one session of it is read by filtering those parts from the
 * head — as often as it is read, and without reading the trajectory again.
 *
 * Nothing here is published: a program reaches the reading through
 * `Trajectory.toSessions`.
 */

import { ByteStore, layer as byteStoreLayer, type ByteStoreError } from "@trajs/utils/ByteStore";
import { Effect, Option, Stream } from "effect";
import * as uuid from "uuid";

import {
  configOf,
  encodePart,
  reading,
  type EncodingServices,
  type Readable,
} from "#/internal/parts.ts";
import type * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * What the pass over a trajectory remembers of one session: where it sits among the others —
 * the declaration that names it, and the fork that places it.
 */
interface Recorded {
  /** The `uuid` of the part that declared the session, where the trajectory declares it. */
  declaration?: string;
  /** The session it continues from, and the part of it it continues from, where a declaration reads a `fork`. */
  fork?: Trajectory.Fork;
}

/**
 * The key a trajectory's parts are kept under: a sequence of its own, since one store keeps the
 * parts of more than one trajectory, and two trajectories name their sessions alike.
 */
const keyOf = (): string => `sessions/${uuid.v7()}`;

/** The store the parts are kept in where a program states none: memory, which lives as long as the program does. */
const inMemory = (): Effect.Effect<ByteStore> => ByteStore.pipe(Effect.provide(byteStoreLayer()));

/**
 * The reading itself, over the store its parts are kept in: one pass over the trajectory, each
 * part kept as the frame the exchange format carries one in — without the header and the metadata
 * a trajectory is written with — and the sessions built from what that pass records.
 */
const stored = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<Config, E, R> & Readable<Config>,
  store: ByteStore,
): Effect.Effect<
  Trajectory.Sessions<Config, TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config>
> =>
  Effect.gen(function* () {
    const config = configOf(trajectory);
    const key = keyOf();

    /** The sessions each part a session continues from was produced in, by the part's `uuid`. */
    const producing = new Map<string, string>();
    /** The sessions a part was read for, by id: what a declaration read after one of them fails with. */
    const named = new Set<string>();
    /** What is remembered of each session the trajectory names, by id, in the order it named them. */
    const recorded = new Map<string, Recorded>();

    /**
     * The session and the part a `fork` continues from: a fork names a part the trajectory holds by
     * the time the declaration reading it is read, so one that names a part it has not reached — or
     * one no session continues from — is a session the trajectory cannot be read as.
     */
    const continuing = (
      id: string,
      fork: string,
    ): Effect.Effect<Trajectory.Fork, TrajectoryError> =>
      Effect.gen(function* () {
        const session = producing.get(fork);

        if (session === undefined) {
          return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
        }

        return { session, part: fork };
      });

    const record = (part: Trajectory.Part<Config>): Effect.Effect<void, TrajectoryError> =>
      Effect.gen(function* () {
        if (part._tag === "Session") {
          // A session declared again is read where it first was declared.
          if (recorded.get(part.id)?.declaration !== undefined) {
            return;
          }

          // A session is declared before the parts it produced, so a declaration read after one of
          // them is a trajectory whose sessions cannot be read.
          if (named.has(part.id)) {
            return yield* Effect.fail(TrajectoryError.session(part.id, "late-declaration"));
          }

          recorded.set(part.id, {
            declaration: part.uuid,
            fork: part.fork === undefined ? undefined : yield* continuing(part.id, part.fork),
          });

          // A fork names a part a session continues from, and a declaration is one of them.
          producing.set(part.uuid, part.id);

          return;
        }

        // A metric part names no session: it is a part of the sessions of the parts it attaches to.
        if (part._tag === "Metric") {
          return;
        }

        if (!recorded.has(part.sessionId)) {
          recorded.set(part.sessionId, {});
        }

        named.add(part.sessionId);

        // A fork names a part it continues from by `uuid` rather than by session, so the session
        // that produced each part is remembered — the prompt, response and session parts, and not
        // the events a kit produces beside them.
        if (part._tag !== "Event") {
          producing.set(part.uuid, part.sessionId);
        }
      });

    yield* trajectory.pipe(
      Stream.tap(record),
      Stream.mapEffect(encodePart(config), { concurrency: 1 }),
      Stream.run(store.write(key)),
    );

    /** The parts of the trajectory as the store keeps them, in the order it held them. */
    const stored = (): Trajectory.TrajectoryStream<Config, TrajectoryError | ByteStoreError> =>
      store.read(key).pipe(
        Effect.map((bytes) => reading(bytes.stream())(config)),
        Stream.unwrap,
      );

    /**
     * Where each session `id` runs on from — the sessions it continues from, from the root down —
     * ends: by the id of each of them, the part the session after it continues from, and none for
     * `id` itself, which is read to the end of the trajectory.
     *
     * It is the index a session is read by, and it is walked back from `id` rather than forward: a
     * fork names the part it continues from, so what the session it names contributes is known from
     * the session that continues from it.
     */
    const lineage = (id: string): ReadonlyMap<string, string | undefined> => {
      /** The forks from the one `id` is nearest to up to the one at its root. */
      const forks: Array<Trajectory.Fork> = [];
      const walked = new Set([id]);

      let fork = recorded.get(id)?.fork;

      // A fork names a part the trajectory reads before the declaration reading it, so walking back
      // ends at a session that continues from nothing; one naming a session already walked is what
      // ends the walk rather than continuing it.
      while (fork !== undefined && !walked.has(fork.session)) {
        walked.add(fork.session);
        forks.push(fork);
        fork = recorded.get(fork.session)?.fork;
      }

      const ends = new Map<string, string | undefined>([[id, undefined]]);

      for (const from of forks) {
        ends.set(from.session, from.part);
      }

      return ends;
    };

    /**
     * The parts the trajectory holds of the session `id`: what it inherited from the sessions it
     * continues from, up to the part each of them is continued from, and what it produced itself.
     */
    const streamOf = (
      id: string,
    ): Trajectory.SessionStream<Config, TrajectoryError | ByteStoreError> =>
      Stream.suspend(() => {
        /** The parts kept so far, by `uuid`: what a metric part is attached to. */
        const held = new Set<string>();
        /** The sessions of the lineage that have reached the part they run on to. */
        const ended = new Set<string>();

        const ends = lineage(id);

        /**
         * Whether the part given is a part of the session: a part of a session of its lineage before
         * the part that session ends at, or a metric part attached to one of them.
         */
        const keep = (part: Trajectory.Part<Config>): boolean => {
          // A declaration names the session it declares rather than the one it was produced in, and is
          // not a part of that session — only what a metric part may be attached to.
          if (part._tag === "Session") {
            if (!ends.has(part.id)) {
              return false;
            }

            held.add(part.uuid);

            // A session continuing from a declaration continues from none of the parts of the session
            // it names, so a session continued from that far contributes nothing.
            if (ends.get(part.id) === part.uuid) {
              ended.add(part.id);
            }

            return false;
          }

          // A metric part names no session: it is held by the sessions of the parts it is attached to.
          if (part._tag === "Metric") {
            return part.metric.data.attach.some((attached) => held.has(attached));
          }

          if (!ends.has(part.sessionId) || ended.has(part.sessionId)) {
            return false;
          }

          held.add(part.uuid);

          if (ends.get(part.sessionId) === part.uuid) {
            ended.add(part.sessionId);
          }

          return true;
        };

        const stream = stored().pipe(Stream.filter(keep));

        // SAFETY: what `keep` drops is the declaration of every session — the one kind of part that
        // names a session rather than being one of its parts — so what is kept is a reading of the
        // parts of one session, which is what a `SessionStream` is.
        return stream as Trajectory.SessionStream<Config, TrajectoryError | ByteStoreError>;
      });

    const sessions: Record<
      string,
      Trajectory.Session<Config, TrajectoryError | ByteStoreError>
    > = {};

    for (const id of recorded.keys()) {
      sessions[id] = {
        id,
        forkedFrom: Option.fromUndefinedOr(recorded.get(id)?.fork),
        stream: streamOf(id),
      };
    }

    return sessions;
  });

/**
 * Reads a trajectory as the sessions it names, keeping its parts in memory for as long as the
 * program runs: the store this reading states rather than the one a program provides.
 */
export const read = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<Config, E, R> & Readable<Config>,
): Effect.Effect<
  Trajectory.Sessions<Config, TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config>
> => Effect.flatMap(inMemory(), (store) => stored(trajectory, store));

/**
 * Reads a trajectory as the sessions it names, keeping its parts in the store a program provides
 * ({@link ByteStore}), so that a session is read out of that store rather than out of the memory
 * of this one reading.
 */
export const readCached = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<Config, E, R> & Readable<Config>,
): Effect.Effect<
  Trajectory.Sessions<Config, TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config> | ByteStore
> => Effect.flatMap(ByteStore, (store) => stored(trajectory, store));
