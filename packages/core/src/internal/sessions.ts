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

import type * as Extra from "#/Extra.ts";
import { cached } from "#/internal/cache.ts";
import type { EncodingServices, Readable } from "#/internal/parts.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * What the pass over a trajectory remembers of one session: where it sits among the others —
 * the declaration that names it, the fork that places it, and the extra data it states.
 */
interface Recorded<Config extends Trajectory.AnyConfig> {
  /** The `uuid` of the part that declared the session, where the trajectory declares it. */
  declaration?: string;
  /** The session it continues from, and the part of it it continues from, where a declaration reads a `fork`. */
  fork?: Session.Fork;
  /** The extra data the declaration of the session states, where the trajectory declares it. */
  extra?: Extra.ExtraRecord<Config["extrakit"]["extra"], "session">;
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
): Effect.Effect<ReadonlyMap<string, Recorded<Config>>, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    /** The sessions each part a session continues from was produced in, by the part's `uuid`. */
    const producing = new Map<string, string>();
    /** The sessions a part was read for, by id: what a declaration read after one of them fails with. */
    const named = new Set<string>();
    /** What is remembered of each session the trajectory names, by id, in the order it named them. */
    const recorded = new Map<string, Recorded<Config>>();

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
          const id = part.type.id;

          // A session declared again is read where it first was declared.
          if (recorded.get(id)?.declaration !== undefined) {
            return;
          }

          // A session is declared before the parts it produced, so a declaration read after one of
          // them is a trajectory whose sessions cannot be read.
          if (named.has(id)) {
            return yield* Effect.fail(TrajectoryError.session(id, "late-declaration"));
          }

          recorded.set(id, {
            declaration: part.uuid,
            fork: part.type._tag === "sub" ? yield* continuing(id, part.type.fork) : undefined,
            extra: part.extra,
          });

          // A fork names a part a session continues from, and a declaration is one of them.
          producing.set(part.uuid, id);

          return;
        }

        // A metric part names no session: it is a part of the sessions of the parts it attaches to.
        if (part._tag === "Metric") {
          return;
        }

        // The main session is the one a part belongs to that states no session of its own.
        const id = part.sessionId ?? Trajectory.mainSessionId;

        if (!recorded.has(id)) {
          recorded.set(id, {});
        }

        named.add(id);

        // A fork names a part it continues from by `uuid` rather than by session, so the session
        // that produced each part is remembered — the prompt, response and session parts, and not
        // the events a kit produces beside them.
        if (part._tag !== "Event") {
          producing.set(part.uuid, id);
        }
      });

    yield* trajectory.pipe(Stream.runForEach(record));

    // A session of its own is read only from the part that declares it, so a part naming one the
    // trajectory does not declare is a session no reader can place. The main session is the one
    // session read whether or not it is declared.
    for (const id of named) {
      if (id !== Trajectory.mainSessionId && recorded.get(id)?.declaration === undefined) {
        return yield* Effect.fail(TrajectoryError.session(id, "undeclared-session"));
      }
    }

    return recorded;
  });

/**
 * Where the sessions a session is read with end: by the id of each of them, the part the session
 * after it continues from — and none for the session itself, which is read to the end of the
 * trajectory.
 */
type Lineage = ReadonlyMap<string, string | undefined>;

/**
 * The sessions the session `id` is read with, and the part each of them is read to: `id` itself,
 * read to the end of the trajectory, and the sessions it continues from, each read to the part the
 * session after it continues from.
 *
 * It is walked back from `id` rather than forward: a fork names the part it continues from, so what
 * the session it names contributes is known from the session that continues from it. So `id` is the
 * entry it holds first and the session at its root the one it holds last.
 */
const lineageOf = <Config extends Trajectory.AnyConfig>(
  recorded: ReadonlyMap<string, Recorded<Config>>,
  id: string,
): Lineage => {
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

/**
 * The parts of the trajectory a cache holds of the sessions of the lineage given: what each of them
 * produced, up to the part it is read to, and the metric parts attached to them.
 */
const streamOf = <Config extends Trajectory.AnyConfig, E>(
  trajectory: Trajectory.Trajectory<string, Config, E, never>,
  ends: Lineage,
): Session.SessionStream<Config, E> =>
  Stream.suspend(() => {
    /** The parts kept so far, by `uuid`: what a metric part is attached to. */
    const held = new Set<string>();
    /** The sessions of the lineage that have reached the part they run on to. */
    const ended = new Set<string>();

    /**
     * Whether the part given is a part of the reading: a part of a session of the lineage before the
     * part that session ends at, or a metric part attached to one of them.
     */
    const keep = (part: Trajectory.Part<Config>): boolean => {
      // A declaration names the session it declares rather than the one it was produced in, and is
      // not a part of that session — only what a metric part may be attached to.
      if (part._tag === "Session") {
        const declared = part.type.id;

        if (!ends.has(declared)) {
          return false;
        }

        held.add(part.uuid);

        // A session continuing from a declaration continues from none of the parts of the session
        // it names, so a session continued from that far contributes nothing.
        if (ends.get(declared) === part.uuid) {
          ended.add(declared);
        }

        return false;
      }

      // A metric part names no session: it is held by the sessions of the parts it is attached to.
      if (part._tag === "Metric") {
        return part.metric.data.attach.some((attached) => held.has(attached));
      }

      // The main session is the one a part belongs to that states no session of its own.
      const produced = part.sessionId ?? Trajectory.mainSessionId;

      if (!ends.has(produced) || ended.has(produced)) {
        return false;
      }

      held.add(part.uuid);

      if (ends.get(produced) === part.uuid) {
        ended.add(produced);
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

    // The sessions are read in the order the trajectory named them, which is the order the reading
    // holds them in: a session after the one it continues from, since a fork names a part read
    // before the declaration that reads it.
    const sessions: Array<Session.Session<Config, E | TrajectoryError>> = [];

    for (const [id, recordedOf] of recorded) {
      const ends = lineageOf(recorded, id);

      sessions.push({
        id,
        forkedFrom: Option.fromUndefinedOr(recordedOf.fork),
        extra: recordedOf.extra ?? {},
        // `ends` holds the session read first and the ones it continues from after it.
        inherited: [...ends]
          .slice(1)
          .toReversed()
          .map(([session, end]) => ({
            session,
            stream: streamOf(trajectory, new Map([[session, end]])),
          })),
        own: streamOf(trajectory, new Map([[id, undefined]])),
        stream: streamOf(trajectory, ends),
      });
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
