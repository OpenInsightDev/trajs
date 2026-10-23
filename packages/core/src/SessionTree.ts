/**
 * The sessions of a trajectory as the tree they were forked into.
 *
 * A session states the session it was forked off rather than repeating what it inherited, and the
 * reading takes a session to be forked off one session, so what the sessions of a trajectory are to
 * each other is one tree: the main session at its root, and the sessions forked off it, each with
 * the sessions forked off it in turn. This module states that tree ({@link SessionTree}, and the
 * schema `SessionTree.SessionTree` that reads and writes one), reads it out of the sessions
 * {@link Session.toSessions} read ({@link fromSessions}), and walks it ({@link sessionIds},
 * {@link forksOf}).
 *
 * The tree is what the sessions state of themselves — the id each is named by, and the extra data
 * its declaration holds — rather than what they ran on: the parts of a session are read of the
 * trajectory ({@link Session.Session.stream}), and the tree is read of the sessions rather than of
 * the trajectory. So the tree is a plain value rather than an effect, and no part of a trajectory
 * is read again for it.
 */

import { Schema } from "effect";

import * as Extra from "#/Extra.ts";
import { readForks, readSessionIds, readTree } from "#/internal/tree.ts";
import type * as Session from "#/Session.ts";
import type * as Trajectory from "#/Trajectory.ts";

/**
 * The tree the sessions of a trajectory were forked into: one session, with the trees of the
 * sessions forked off it held under it.
 *
 * **When to use**
 *
 * Use to read a session of a trajectory with the sessions forked off it — to show a trajectory as
 * the sessions it was forked into, or to walk them — rather than reading the `forkedFrom` of every
 * session to find it.
 *
 * **Details**
 *
 * - A tree is a session — the one at its root — with the trees of the sessions forked off it under
 *   it, and those with the sessions forked off them in turn. The sessions of a trajectory hang off
 *   one root, since the main session is the one session of a trajectory forked off none
 *   ({@link Trajectory.mainSessionId}): {@link fromSessions} reads them as that one tree.
 * - `id` is the id the trajectory names the session by, and `extra` is the extra data its
 *   declaration states ({@link Extra.ExtraRecord}) — what a session states of itself beside the
 *   id, since where it sits among the others is the tree itself.
 * - `forks` is the trees of the sessions that state it as the one they were forked off, in the
 *   order the record of sessions holds them, and is empty for a session nothing was forked off.
 * - What a session ran on is not part of a tree: the parts of a session are read of the
 *   trajectory ({@link Session.Session.stream}), so a tree states the sessions of a trajectory
 *   rather than what they hold.
 * - The part a session continues from — the `part` of the `fork` it states
 *   ({@link Session.Session.forkedFrom}) — is not part of a tree either: the tree places the
 *   sessions, and the part one continues from is read of the session itself.
 *
 * **Example** (A tree of sessions, and the sessions forked off its root)
 *
 * ```ts import.meta.vitest
 * import { SessionTree, Trajectory } from "@trajs/core"
 *
 * // The main session, with the two sessions forked off it held under it.
 * const tree: SessionTree.SessionTree<Trajectory.AnyConfig> = {
 *   id: "main",
 *   extra: {},
 *   forks: [
 *     { id: "reply", extra: {}, forks: [] },
 *     { id: "aside", extra: {}, forks: [] }
 *   ]
 * }
 *
 * tree.forks.map((session) => session.id) // => ["reply", "aside"]
 * ```
 *
 * @see {@link fromSessions} for reading the sessions of a trajectory as one.
 * @see {@link sessionIds} and {@link forksOf} for walking it.
 * @see {@link Session.Session} for the session a tree is read of.
 * @category models
 */
export interface SessionTree<Config extends Trajectory.AnyConfig> {
  readonly id: string;
  readonly extra: Extra.ExtraRecord<Config["extrakit"]["extra"], "session">;
  readonly forks: ReadonlyArray<SessionTree<Config>>;
}

/**
 * A tree as it is encoded: the sessions it holds and the forks that place them, with the extra data
 * of each as the kit of its config writes it.
 *
 * @see {@link SessionTree} for the tree itself, and for the schema that writes one.
 * @category models
 */
export type SessionTreeEncoded<Config extends Trajectory.AnyConfig> = Readonly<{
  id: string;
  extra: Extra.ExtraRecordEncoded<Config["extrakit"]["extra"], "session">;
  forks: ReadonlyArray<SessionTreeEncoded<Config>>;
}>;

/**
 * The schema of a tree, as the extra kit of the config given reads it.
 *
 * **When to use**
 *
 * Use to write a tree where a program keeps one — an index beside the trajectory, what a page is
 * handed — and to read it back, rather than to read the sessions of a trajectory as one
 * ({@link fromSessions}).
 *
 * **Details**
 *
 * - Every session of the tree is read by the schema of a session part of the config
 *   ({@link Extra.ExtraRecord}), so the extra data of one is what the declaration of the session
 *   states, at each version the kit reads ({@link Extra.ExtraRecordEncoded}).
 * - A tree is as deep as the forks of a trajectory are, so the schema is stated with
 *   {@link Schema.suspend}: one schema reads a tree of any depth, rather than the schema of a tree
 *   being stated once per depth it is read at.
 * - What a session ran on is no part of a tree, so no part of a trajectory is read or written by
 *   it: a tree is read of the sessions rather than of the trajectory they were read of.
 *
 * **Example** (Writing a tree of sessions, and reading it back)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { SessionTree, Trajectory } from "@trajs/core"
 *
 * const schema = SessionTree.SessionTree(Trajectory.anyConfig)
 *
 * // The main session, and the session forked off it.
 * const tree: SessionTree.SessionTree<Trajectory.AnyConfig> = {
 *   id: "main",
 *   extra: {},
 *   forks: [{ id: "reply", extra: {}, forks: [] }]
 * }
 *
 * // A tree of sessions is what the schema reads, and what it writes is a tree again.
 * Schema.is(schema)(tree) // => true
 * Schema.decodeUnknownSync(schema)(Schema.encodeSync(schema)(tree)) // => tree
 * Schema.is(schema)({ main: "reply" }) // => false
 * ```
 *
 * @see {@link SessionTree} for the tree it reads.
 * @see {@link fromSessions} for reading the sessions of a trajectory as one.
 * @category schemas
 */
export const SessionTree = <Config extends Trajectory.AnyConfig>(
  config: Config,
): Schema.Codec<SessionTree<Config>, SessionTreeEncoded<Config>> => {
  const tree: Schema.Codec<SessionTree<Config>, SessionTreeEncoded<Config>> = Schema.Struct({
    id: Schema.String,
    extra: Extra.ExtraRecord(config.extrakit, "session"),
    forks: Schema.Array(
      Schema.suspend((): Schema.Codec<SessionTree<Config>, SessionTreeEncoded<Config>> => tree),
    ),
  });

  return tree;
};

/**
 * Reads the sessions given as the tree they were forked into.
 *
 * **When to use**
 *
 * Use to read what the sessions of a trajectory are to each other — to list them in the order they
 * were forked into, to find the sessions forked off one of them, or to show a trajectory as the
 * sessions it holds — rather than walking the `forkedFrom` of each of them to find it.
 *
 * **Details**
 *
 * What it reads is the {@link SessionTree} of the sessions: the main session as its root
 * ({@link Trajectory.mainSessionId}), holding the sessions forked off it, each with the sessions
 * forked off it in turn. It is a reading of the sessions rather than of the trajectory: a session
 * states the session it was forked off and the extra data its declaration holds, so what the tree
 * is made of is what the sessions already hold, and no part of a trajectory is read again for it.
 *
 * The sessions of a trajectory hold the main session: a session of its own is declared by a fork
 * that names a part of a session the trajectory already read ({@link Session.Fork}), so every
 * session hangs off the main session, the one session a trajectory reads without declaring it
 * ({@link Trajectory.mainSessionId}).
 *
 * **Example** (Reading the sessions of a trajectory as the tree they were forked into)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Session, SessionTree, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const answered = part.response(
 *   Response.makePart("text", { text: "It is a session that continues another." })
 * )
 *
 * // The main session asks and is answered, and a session forked off the answer asks again.
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.mainSession(),
 *     part.prompt(Prompt.make("What is a fork?")),
 *     answered,
 *     part.subSession("reply", { fork: answered.uuid }),
 *     part.prompt(Prompt.make("And what does it hold?"), { sessionId: "reply" })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 * const tree = SessionTree.fromSessions(sessions)
 *
 * // The main session is the root of it, and the session forked off its answer hangs under it.
 * tree.id // => "main"
 * SessionTree.sessionIds(tree) // => ["main", "reply"]
 * SessionTree.forksOf(Trajectory.mainSessionId)(tree) // => ["reply"]
 * ```
 *
 * @see {@link SessionTree} for the tree it reads.
 * @see {@link Session.Sessions} for the sessions it is read from.
 * @see {@link sessionIds} and {@link forksOf} for walking it.
 * @see {@link Session.Session.forkedFrom} for the session one of them was forked off.
 * @category constructors
 */
export const fromSessions = <Config extends Trajectory.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): SessionTree<Config> => readTree(sessions);

/**
 * Every session of the tree, a session before the sessions forked off it.
 *
 * **When to use**
 *
 * Use to read the sessions of a trajectory in the order they were forked into — to list them with
 * each under the one it continues from, or to read a {@link SessionTree} as the ids it holds.
 *
 * **Details**
 *
 * The ids are those a depth-first walk of the tree reads: a session before the sessions forked off
 * it, each with what was forked off it before the forks beside it. So the tree of the sessions
 * `main`, `reply` and `follow-up` — the last forked off `reply`, which was forked off `main` — is
 * read as `["main", "reply", "follow-up"]`. A session is held once in a tree, so an id is read
 * once.
 *
 * **Example** (Reading the ids of a tree of sessions)
 *
 * ```ts import.meta.vitest
 * import { SessionTree, Trajectory } from "@trajs/core"
 *
 * // The main session, a session forked off it, and one forked off that.
 * const tree: SessionTree.SessionTree<Trajectory.AnyConfig> = {
 *   id: "main",
 *   extra: {},
 *   forks: [
 *     { id: "reply", extra: {}, forks: [{ id: "follow-up", extra: {}, forks: [] }] },
 *     { id: "aside", extra: {}, forks: [] }
 *   ]
 * }
 *
 * SessionTree.sessionIds(tree) // => ["main", "reply", "follow-up", "aside"]
 * ```
 *
 * @see {@link SessionTree} for the tree it is read from.
 * @see {@link forksOf} for the sessions forked off one of them.
 * @see {@link fromSessions} for reading the sessions of a trajectory as that tree.
 * @category combinators
 */
export const sessionIds = <Config extends Trajectory.AnyConfig>(
  tree: SessionTree<Config>,
): ReadonlyArray<string> => readSessionIds(tree);

/**
 * The sessions the tree holds as forked directly off the session given.
 *
 * **When to use**
 *
 * Use to find the sessions that continue one session — what was forked off it — rather than
 * reading every session of a trajectory for the ones whose `forkedFrom` names it.
 *
 * **Details**
 *
 * The session may be held anywhere in the tree, and the ids are read in the order the tree holds
 * them. Only the sessions forked off it are read, not the sessions forked off those: the whole of
 * the tree is what {@link sessionIds} reads. A session nothing was forked off — the main session,
 * and a session none continues — has none forked off it, and so does an id the tree does not hold.
 *
 * **Example** (Reading the sessions forked off one session)
 *
 * ```ts import.meta.vitest
 * import { SessionTree, Trajectory } from "@trajs/core"
 *
 * // The main session, two sessions forked off it, and one of those forked off once again.
 * const tree: SessionTree.SessionTree<Trajectory.AnyConfig> = {
 *   id: "main",
 *   extra: {},
 *   forks: [
 *     { id: "reply", extra: {}, forks: [{ id: "follow-up", extra: {}, forks: [] }] },
 *     { id: "aside", extra: {}, forks: [] }
 *   ]
 * }
 *
 * SessionTree.forksOf("main")(tree) // => ["reply", "aside"]
 * SessionTree.forksOf("reply")(tree) // => ["follow-up"]
 * SessionTree.forksOf("aside")(tree) // => []
 * ```
 *
 * @see {@link SessionTree} for the tree it is read from.
 * @see {@link sessionIds} for every session of it.
 * @see {@link Session.Session.forkedFrom} for the session one of them was forked off.
 * @category combinators
 */
export const forksOf =
  (id: string) =>
  <Config extends Trajectory.AnyConfig>(tree: SessionTree<Config>): ReadonlyArray<string> =>
    readForks(id)(tree);
