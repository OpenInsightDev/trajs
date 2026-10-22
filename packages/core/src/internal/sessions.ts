/**
 * The reading behind {@link Session.toSessions}: the trajectory it is given, cached by
 * `Trajectory.cache` so that its parts are read once and read again — one pass over it records
 * the sessions it declares, and each session is then read as the parts of that cache which
 * belong to it, as often as it is read.
 *
 * Nothing here is published: a program reaches the reading through `Session.toSessions`.
 */

import {
  type ByteStore,
  layer as byteStoreLayer,
  type ByteStoreError,
} from "@trajs/utils/ByteStore";
import { Effect, Option, Scope, Stream } from "effect";

import { cached } from "#/internal/cache.ts";
import type { EncodingServices, Readable } from "#/internal/parts.ts";
import type * as Session from "#/Session.ts";
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
  fork?: Session.Fork;
}

/**
 * What one pass over a trajectory remembers of the sessions it names: the declaration of each,
 * and the fork that places it among the others.
 *
 * The pass is the only reading of the trajectory itself: what a session is read from is known
 * once the parts it was produced after have been read, so the sessions are read from what this
 * keeps rather than from the trajectory a second time.
 */
const recordedIn = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.Effect<ReadonlyMap<string, Recorded>, E | TrajectoryError, R> =>
  Effect.gen(function* () {
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
    const continuing = (id: string, fork: string): Effect.Effect<Session.Fork, TrajectoryError> =>
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

    yield* trajectory.pipe(Stream.runForEach(record));

    return recorded;
  });

/**
 * The parts of the trajectory a cache holds of the session `id`: what it inherited from the
 * sessions it continues from, up to the part each of them is continued from, and what it produced
 * itself.
 *
 * It is an index a session is read by, and it is walked back from `id` rather than forward: a
 * fork names the part it continues from, so what the session it names contributes is known from
 * the session that continues from it.
 */
const streamOf = <Config extends Trajectory.AnyConfig, E>(
  trajectory: Trajectory.Trajectory<string, Config, E, never>,
  recorded: ReadonlyMap<string, Recorded>,
  id: string,
): Session.SessionStream<Config, E> =>
  Stream.suspend(() => {
    /** The parts kept so far, by `uuid`: what a metric part is attached to. */
    const held = new Set<string>();
    /** The sessions of the lineage that have reached the part they run on to. */
    const ended = new Set<string>();

    /**
     * Where each session `id` runs on from — the sessions it continues from, from the root down —
     * ends: by the id of each of them, the part the session after it continues from, and none for
     * `id` itself, which is read to the end of the trajectory.
     */
    const lineage = (): ReadonlyMap<string, string | undefined> => {
      /** The forks from the one `id` is nearest to up to the one at its root. */
      const forks: Array<Session.Fork> = [];
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

    const ends = lineage();

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

    const stream = trajectory.pipe(Stream.filter(keep));

    // SAFETY: what `keep` drops is the declaration of every session — the one kind of part that
    // names a session rather than being one of its parts — so what is kept is a reading of the
    // parts of one session, which is what a `SessionStream` is.
    return stream as Session.SessionStream<Config, E>;
  });

const sessionsOf = <Config extends Trajectory.AnyConfig, E>(
  trajectory: Trajectory.Trajectory<string, Config, E, never>,
): Effect.Effect<Session.Sessions<Config, E | TrajectoryError>, E | TrajectoryError> =>
  Effect.gen(function* () {
    const recorded = yield* recordedIn(trajectory);

    const sessions: Record<string, Session.Session<Config, E | TrajectoryError>> = {};

    for (const id of recorded.keys()) {
      sessions[id] = {
        id,
        forkedFrom: Option.fromUndefinedOr(recorded.get(id)?.fork),
        stream: streamOf(trajectory, recorded, id),
      };
    }

    return sessions;
  });

/**
 * Reads a trajectory as the sessions it names, keeping its parts in memory for as long as the
 * program runs: the store this reading states rather than the one a program provides.
 */
export const read = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R> & Readable<Config>,
): Effect.Effect<
  Session.Sessions<Config, E | TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config>
> =>
  Effect.gen(function* () {
    // Every part is kept in memory, so a session is read out of the cache itself rather than out of
    // a store that outlives it: the pass that records the sessions reads the trajectory to its end,
    // so the scope the cache was made in closes with every part still where its readers look.
    const sessions = yield* cached(trajectory, { capacity: "unbounded" }).pipe(
      Effect.flatMap(sessionsOf),
      Effect.scoped,
    );

    return sessions;
  }).pipe(Effect.provide(byteStoreLayer()));

/**
 * Reads a trajectory as the sessions it names, keeping its parts in the store a program provides
 * ({@link ByteStore}), so that a session is read out of what the cache of it holds rather than
 * out of the memory of this one reading.
 *
 * What `options` states is what that cache is read with ({@link Trajectory.CacheOptions}): how
 * many of the newest parts are kept in memory, and the rest written into the store.
 */
export const readCached = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R> & Readable<Config>,
  options?: Trajectory.CacheOptions,
): Effect.Effect<
  Session.Sessions<Config, E | TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config> | ByteStore | Scope.Scope
> => Effect.flatMap(cached(trajectory, options), sessionsOf);
