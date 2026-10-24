/**
 * The reading behind {@link Session.main}: the trajectory cached once, so every session
 * reads the parts of its own from a stream that can be iterated again, and the sessions
 * the trajectory declares placed as the tree they were forked into.
 *
 * Nothing here is published: a program reaches the reading through {@link Session.main}.
 */

import type { ByteStore } from "@trajs/utils";
import { Effect, Stream } from "effect";

import type * as Config from "#/Config.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/** A part of a session, which is every part of a trajectory but the declaration of one. */
type Part<Config extends Config.AnyConfig> = Exclude<
  Trajectory.Part<Config>,
  Trajectory.SessionPart<Config["extrakit"]>
>;

/** What the declaration of a session states of the session it places in the tree. */
interface Declared {
  /** The session it continues from, named by the part it continues from. */
  readonly session: string;
  /** The `uuid` of the part it continues from. */
  readonly fork: string;
}

/**
 * Whether a part is one a session holds: every part but a declaration, which names the
 * session it declares rather than being a part of it.
 */
const isPart = <Config extends Config.AnyConfig>(
  part: Trajectory.Part<Config>,
): part is Part<Config> => part._tag !== "Session";

/**
 * Whether a part belongs to the session given: a part states the session it was produced
 * in, and a part stating none belongs to the main session. A metric part names no session
 * and belongs to the sessions of the parts it is attached to.
 */
const belongsTo = <Config extends Config.AnyConfig>(
  part: Part<Config>,
  id: string,
  contained: ReadonlyMap<string, string>,
): boolean => {
  if (part._tag === "Metric") {
    return part.metric.data.attach.some(
      (attached) => attached === id || contained.get(attached) === id,
    );
  }

  return (part.sessionId ?? Trajectory.mainSessionId) === id;
};

/** The parts of one session, read out of the cache of a trajectory as often as asked for. */
const streamOf = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  contained: ReadonlyMap<string, string>,
  id: string,
): Session.SessionStream<Config, E, R> =>
  trajectory.pipe(
    Stream.filter(isPart<Config>),
    Stream.filter((part) => belongsTo(part, id, contained)),
  );

type Read<Config extends Config.AnyConfig, E, R> = Session.MainSession<
  Config,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.DecodingServices<Config>
>;

export const read = Effect.fn(function* <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.fn.Return<
  Read<Config, E, R>,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.EncodingServices<Config> | Config.DecodingServices<Config> | ByteStore.ByteStore
> {
  const cached = yield* Trajectory.cache(trajectory);

  const parts = yield* cached.pipe(Stream.runCollect);

  /** The session each part a session continues from was produced in, by the part's `uuid`. */
  const producing = new Map<string, string>();
  /** The session each part was produced in, by the part's `uuid`, for the metrics attached to it. */
  const contained = new Map<string, string>();
  /** The parts of each session that named it before the declaration reading it. */
  const named = new Set<string>();
  /** What each declared session states, by id, in the order the trajectory declares them. */
  const declared = new Map<string, Declared>();

  for (const part of parts) {
    if (part._tag === "Session") {
      const id = part.type.id;

      contained.set(part.uuid, id);

      // The main session is read whether or not the trajectory declares it, and a
      // session declared again is read where it first was declared.
      if (id === Trajectory.mainSessionId || declared.has(id)) {
        producing.set(part.uuid, id);

        continue;
      }

      // A session is declared before the parts it produced.
      if (named.has(id)) {
        return yield* Effect.fail(TrajectoryError.session(id, "late-declaration"));
      }

      // A `fork` names a part read before the declaration reading it.
      if (part.type._tag === "sub") {
        const session = producing.get(part.type.fork);

        if (session === undefined) {
          return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
        }

        declared.set(id, { session, fork: part.type.fork });
      }

      producing.set(part.uuid, id);

      continue;
    }

    // A metric part names no session: it is read by the parts it is attached to.
    if (part._tag === "Metric") {
      continue;
    }

    const id = part.sessionId ?? Trajectory.mainSessionId;

    named.add(id);
    contained.set(part.uuid, id);

    // The parts a session continues from are the prompts, responses and declarations.
    if (part._tag !== "Event") {
      producing.set(part.uuid, id);
    }
  }

  // A session of its own is read only from the part that declares it, and the main
  // session is the one session read without one.
  for (const id of named) {
    if (id !== Trajectory.mainSessionId && !declared.has(id)) {
      return yield* Effect.fail(TrajectoryError.session(id, "undeclared-session"));
    }
  }

  const streamOfSession = (id: string) =>
    streamOf<
      Config,
      E | TrajectoryError | ByteStore.ByteStoreError,
      R | Config.DecodingServices<Config>
    >(cached, contained, id);

  // The main session is the root of the tree, and every other session hangs off the
  // session it continues from.
  const root: Read<Config, E, R> = {
    id: Trajectory.mainSessionId,
    forkBy: {},
    stream: streamOfSession(Trajectory.mainSessionId),
  };

  const sessions = new Map<
    string,
    Session.Session<
      Config,
      E | TrajectoryError | ByteStore.ByteStoreError,
      R | Config.DecodingServices<Config>
    >
  >();

  for (const [id, { session, fork }] of declared) {
    const parent = session === Trajectory.mainSessionId ? root : sessions.get(session);

    if (parent === undefined) {
      return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
    }

    const forked: Session.Session<
      Config,
      E | TrajectoryError | ByteStore.ByteStoreError,
      R | Config.DecodingServices<Config>
    > = {
      id,
      forkFrom: { session: parent, uuid: fork },
      forkBy: {},
      stream: streamOfSession(id),
    };

    parent.forkBy[id] = forked;
    sessions.set(id, forked);
  }

  return root;
});
