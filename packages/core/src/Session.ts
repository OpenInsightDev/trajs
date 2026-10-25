import { Effect, type Option, type Stream } from "effect";

import * as Cache from "#/Cache.ts";
import type * as Config from "#/Config.ts";
import { allSessions, findSession, read, sessionParts } from "#/internal/session.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The parts one session ran on: every part of a trajectory that states its id, and the
 * metric parts attached to those, in the order the trajectory holds them.
 *
 * A declaration names the session it declares rather than being a part of it, so what a
 * session stream holds is every other kind of part.
 *
 * @see {@link Session} for the session it is read from.
 * @category models
 */
export type SessionStream<Config extends Config.AnyConfig, E, R> = Stream.Stream<
  Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
  E,
  R
>;

/**
 * One session of a trajectory, placed in the tree it was forked into.
 *
 * **Details**
 *
 * - `forkFrom` is the session it continues from, and the `uuid` of the part it continues
 *   from: a prompt, a response, or the declaration of that session.
 * - `forkBy` holds the sessions forked directly off it, keyed by their id.
 * - `stream` is what it ran on, read out of the cache of the trajectory, so it can be
 *   iterated as often as it is asked for. It holds no part inherited from `forkFrom`;
 *   {@link stream} splices those in.
 *
 * @see {@link MainSession} for the root of the tree.
 * @category models
 */
export type Session<Config extends Config.AnyConfig, E, R> = Readonly<{
  id: string;
  forkFrom: Readonly<{
    session: Session<Config, E, R> | MainSession<Config, E, R>;
    uuid: string;
  }>;
  forkBy: Record<string, Session<Config, E, R>>;
  stream: SessionStream<Config, E, R>;
}>;

/**
 * The main session of a trajectory: the root of the tree it declares, the one session
 * whose parts state no id of their own or state {@link Trajectory.mainSessionId}.
 *
 * @see {@link Session} for a session forked off it.
 * @see {@link main} for reading a trajectory as it.
 * @category models
 */
export type MainSession<Config extends Config.AnyConfig, E, R> = Readonly<{
  id: typeof Trajectory.mainSessionId;
  forkBy: Record<string, Session<Config, E, R>>;
  stream: SessionStream<Config, E, R>;
}>;

/**
 * A session of a trajectory, whether the main session at the root of the tree or one
 * forked off another.
 *
 * **When to use**
 *
 * Use to hold a session the tree walks over without knowing whether it is the root.
 *
 * @see {@link MainSession} for the root of the tree.
 * @see {@link Session} for a session forked off another.
 * @category models
 */
export type AnySession<Config extends Config.AnyConfig, E, R> =
  | Session<Config, E, R>
  | MainSession<Config, E, R>;

/**
 * Reads a trajectory as the sessions it declares, with the main session at the root.
 *
 * **When to use**
 *
 * Use to read a trajectory one session at a time rather than as the single order its
 * parts arrived in.
 *
 * **Details**
 *
 * The trajectory is cached first, so its parts are read once and every session stream
 * reads them again. A trajectory the cache already read under the same id is not read
 * again. One pass records what the parts state of the sessions they name, and a second
 * pass resolves the forks. This reading keeps no part. Every stream then filters the
 * cache, so where the parts live is the {@link Cache.Cache} the program provides: a
 * trajectory too large to hold in memory is read through
 * {@link Cache.layerFsTemp}, which keeps the parts in a temporary directory.
 *
 * The sessions read the parts the cache kept, so they are read while the cache's store
 * lives.
 *
 * A session's stream holds the parts that state its id, and the metric parts attached to
 * them, in the order the trajectory holds them. The main session is the one session read
 * without a declaration, and a part naming another session the trajectory does not
 * declare fails the reading.
 *
 * A session is declared before the parts it produced, and a `fork` names a part read
 * before the declaration reading it. A trajectory that breaks either rule fails with a
 * {@link TrajectoryError}.
 *
 * @see {@link MainSession} for the reading.
 * @see {@link Session} for one session of it.
 * @category constructors
 */
export const main = Effect.fn(function* <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.fn.Return<
  MainSession<Config, E | TrajectoryError | Cache.CacheError, R | Config.DecodingServices<Config>>,
  E | TrajectoryError | Cache.CacheError,
  R | Config.EncodingServices<Config> | Config.DecodingServices<Config> | Cache.Cache
> {
  const cache = yield* Cache.Cache;
  const cached = yield* cache.cache(trajectory);

  return yield* read(cached);
});

/**
 * Reads the parts `session` ran on, spliced with what it inherited from the sessions it
 * continues from.
 *
 * **When to use**
 *
 * Use to read everything a session saw, whether it produced it or inherited it.
 *
 * **Details**
 *
 * The stream holds the parts of the session that was continued from up to the part it
 * was continued at, down the chain of continuations, then the parts the session produced
 * itself. {@link Session.stream} holds only what a session produced itself.
 *
 * @see {@link main} for the tree the session is read from.
 * @see {@link Session.stream} for the parts a session produced itself.
 * @category combinators
 */
export const stream = <Config extends Config.AnyConfig, E, R>(
  session: AnySession<Config, E, R>,
): SessionStream<Config, E, R> => sessionParts(session);

/**
 * Reads every session of the tree, the main session before the sessions forked off it.
 *
 * **When to use**
 *
 * Use to read a whole trajectory one session at a time, such as to report what each
 * session did or to render the tree it declares.
 *
 * **Details**
 *
 * A session is read before the sessions forked off it, and the sessions forked off one
 * are read in the order they were declared.
 *
 * @see {@link main} for the tree this walks.
 * @see {@link find} for one session of it, by the id it carries.
 * @category combinators
 */
export const all = <Config extends Config.AnyConfig, E, R>(
  main: MainSession<Config, E, R>,
): ReadonlyArray<AnySession<Config, E, R>> => allSessions(main);

/**
 * Finds the session `id` names in the tree, or none where the tree holds no such
 * session.
 *
 * **When to use**
 *
 * Use to read one session a reader names, rather than the sessions a walk reaches.
 *
 * @see {@link all} for every session of the tree.
 * @see {@link stream} for the parts a session ran on.
 * @category combinators
 */
export const find = <Config extends Config.AnyConfig, E, R>(
  main: MainSession<Config, E, R>,
  id: string,
): Option.Option<AnySession<Config, E, R>> => findSession(main, id);
