/**
 * Session trees and inherited conversation streams.
 *
 * {@link main} reads and validates a cached trajectory.
 * {@link stream} adds inherited parts to a session's own stream.
 *
 * @stability stable
 */

import { Effect, type Option, type Stream } from "effect";

import * as Cache from "#/Cache.ts";
import type * as Config from "#/Config.ts";
import { allSessions, findSession, read, sessionParts } from "#/internal/session.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A session's own parts and attached metric reports in trajectory order.
 *
 * **Details**
 *
 * Session declarations are excluded.
 * Metrics can attach to the session id, its declaration uuid, or an earlier part uuid.
 * Unattached metrics are excluded.
 *
 * @see {@link Session} for the session owning the stream.
 * @see {@link stream} for including inherited parts.
 * @stability stable
 * @category models
 */
export type SessionStream<Config extends Config.AnyConfig, E, R> = Stream.Stream<
  Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
  E,
  R
>;

/**
 * A non-main session with its parent fork and direct children.
 *
 * **Details**
 *
 * `forkFrom` names the parent session and fork part uuid.
 * A fork targets a prompt, response, or session declaration.
 * `forkBy` holds direct children keyed by session id.
 * The `stream` field replays only this session's own parts from the cache.
 *
 * @see {@link stream} for including inherited parts.
 * @see {@link MainSession} for the root without a parent fork.
 * @stability stable
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
 * The session tree root, identified by {@link Trajectory.mainSessionId}.
 *
 * **Details**
 *
 * Parts with an omitted `sessionId` belong to this session.
 * An explicit main-session id has the same meaning.
 * The root requires no declaration and has no parent fork.
 *
 * @see {@link Session} for non-main sessions.
 * @see {@link main} for reading the tree.
 * @stability stable
 * @category models
 */
export type MainSession<Config extends Config.AnyConfig, E, R> = Readonly<{
  id: typeof Trajectory.mainSessionId;
  forkBy: Record<string, Session<Config, E, R>>;
  stream: SessionStream<Config, E, R>;
}>;

/**
 * A session tree node, including the root.
 *
 * **When to use**
 *
 * Use when traversing sessions without assuming a parent exists.
 *
 * @see {@link MainSession} for the root of the tree.
 * @see {@link Session} for a node with a parent fork.
 * @stability stable
 * @category models
 */
export type AnySession<Config extends Config.AnyConfig, E, R> =
  | Session<Config, E, R>
  | MainSession<Config, E, R>;

/**
 * Reads a trajectory into a validated session tree.
 *
 * **When to use**
 *
 * Use to separate interleaved sessions and resolve their parent forks.
 *
 * **Details**
 *
 * {@link Cache.Cache} reads the source to completion before session discovery.
 * Session streams replay filtered parts from that cache.
 * The main session exists without a declaration.
 *
 * **Gotchas**
 *
 * Non-main sessions must be declared before their first prompt, response, or event.
 * Forks must name an earlier prompt, response, or session declaration.
 * Invalid sessions fail with {@link TrajectoryError}.
 * Repeated declarations for an already declared id are ignored.
 * Session streams require the cache's backing store to remain available.
 * Each session replay scans the cached trajectory.
 *
 * @see {@link MainSession} for the resulting tree root.
 * @see {@link Cache.layerFsTemp} for disk-backed caching with a finite capacity.
 * @stability stable
 * @category constructors
 */
export const main = Effect.fn(function* <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.fn.Return<
  MainSession<Config, E | TrajectoryError | Cache.CacheError, R | Config.DecodingServices<Config>>,
  E | TrajectoryError | Cache.CacheError,
  R | Config.SchemaServices<Config> | Cache.Cache
> {
  const cache = yield* Cache.Cache;
  const cached = yield* cache.cache(trajectory);

  return yield* read(cached);
});

/**
 * Reads a session's parts after its inherited ancestor prefixes.
 *
 * **When to use**
 *
 * Use to reconstruct the conversation available to a forked session.
 *
 * **Details**
 *
 * Ancestor prefixes appear from root to parent, each ending at its fork part inclusively.
 * The session's own parts follow those prefixes.
 *
 * **Gotchas**
 *
 * A fork from a session declaration inherits no parts from that parent.
 * Declarations are absent from session streams.
 * Metrics after a fork part are excluded from that inherited prefix.
 *
 * @see {@link Session} for the stream field containing only its own parts.
 * @stability stable
 * @category combinators
 */
export const stream = <Config extends Config.AnyConfig, E, R>(
  session: AnySession<Config, E, R>,
): SessionStream<Config, E, R> => sessionParts(session);

/**
 * Returns every session in depth-first preorder, starting with the root.
 *
 * **When to use**
 *
 * Use to process or display each session once.
 *
 * **Details**
 *
 * Children follow the property enumeration order of each `forkBy` record.
 * Numeric-looking ids can therefore precede other ids regardless of declaration order.
 *
 * @see {@link find} for lookup by id.
 * @stability stable
 * @category getters
 */
export const all = <Config extends Config.AnyConfig, E, R>(
  main: MainSession<Config, E, R>,
): ReadonlyArray<AnySession<Config, E, R>> => allSessions(main);

/**
 * Finds a session by id, returning none when absent.
 *
 * @see {@link all} for every session in traversal order.
 * @stability stable
 * @category getters
 */
export const find = <Config extends Config.AnyConfig, E, R>(
  main: MainSession<Config, E, R>,
  id: string,
): Option.Option<AnySession<Config, E, R>> => findSession(main, id);
