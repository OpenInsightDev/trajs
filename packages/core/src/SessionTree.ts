/**
 * The sessions of a trajectory as the tree they were forked into.
 *
 * A session states the session it was forked off rather than repeating what it inherited, and the
 * reading takes a session to be forked off one session, so what the sessions of a trajectory are to
 * each other is one tree: the main session at its root, and the sessions forked off it, each with
 * the sessions forked off it in turn. This module states that tree ({@link SessionTree}), reads it
 * out of the sessions {@link Session.toSessions} read ({@link make}), and walks it
 * ({@link dfs}, {@link sessionIds}, {@link forksOf}).
 *
 * A tree holds the session it places, so a walk of the tree is a walk of the sessions: what a
 * session ran on is read where the tree is found ({@link Session.Session.stream}) rather than
 * looked up by the id the session is named by. The tree places the sessions and reads no part of a
 * trajectory again for it.
 */

import { readDfs, readForks, readTree } from "#/internal/tree.ts";
import type * as Session from "#/Session.ts";
import type * as Trajectory from "#/Trajectory.ts";

/**
 * One session of a trajectory, and the trees of the sessions forked off it.
 *
 * **When to use**
 *
 * Use to read a session with the sessions forked off it — to show a trajectory as the sessions it
 * was forked into, to walk them, or to read what one of them came to with its forks — rather than
 * reading the `forkedFrom` of every session to find the ones that name it.
 *
 * **Details**
 *
 * - `session` is the session the tree places, with what it ran on ({@link Session.Session}): the id
 *   it is named by, the `forkedFrom` it continues, the extra data its declaration states, and its
 *   `stream`.
 * - `forks` is the trees of the sessions that state it as the one they were forked off, in the
 *   order the reading holds them, and is empty for a session nothing was forked off.
 * - The sessions of a trajectory hang off one root, since the main session is the one session
 *   forked off none ({@link Trajectory.mainSessionId}): {@link make} reads them as that one tree,
 *   and a tree is read of the sessions rather than of the trajectory, so no part of one is read for
 *   it.
 *
 * **Example** (A tree of sessions, read with the sessions forked off its root)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Session, SessionTree, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const answered = part.response(Response.makePart("text", { text: "A tree." }))
 *
 * // The main session asks and is answered, and a session forked off the answer asks again.
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.mainSession(),
 *     part.prompt(Prompt.make("What is a fork?")),
 *     answered,
 *     part.subSession("reply", { fork: answered.uuid })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 * const tree = SessionTree.make(sessions)
 *
 * // The root holds its own session, and the sessions forked off it under it.
 * tree.session.id // => "main"
 * tree.forks.map((fork) => fork.session.id) // => ["reply"]
 * ```
 *
 * @see {@link make} for reading the sessions of a trajectory as one.
 * @see {@link dfs} and {@link sessionIds} for walking it.
 * @see {@link forksOf} for the sessions forked off one of them.
 * @see {@link Session.Session} for the session a tree holds.
 * @category models
 */
export interface SessionTree<Config extends Trajectory.AnyConfig, E = never, R = never> {
  readonly session: Session.Session<Config, E, R>;
  readonly forks: ReadonlyArray<SessionTree<Config, E, R>>;
}

/**
 * Reads the sessions given as the tree they were forked into.
 *
 * **When to use**
 *
 * Use to read what the sessions of a trajectory are to each other — to read them in the order they
 * were forked into, to find the sessions forked off one of them, or to show a trajectory as the
 * sessions it holds — rather than walking the `forkedFrom` of each of them to find it.
 *
 * **Details**
 *
 * What it reads is the {@link SessionTree} of the sessions: the main session at its root, holding
 * the sessions forked off it, each with the sessions forked off it in turn. It is a reading of the
 * sessions rather than of the trajectory: a session states the session it was forked off and holds
 * what it ran on, so what the tree is made of is what the sessions already hold, and no part of a
 * trajectory is read again for it.
 *
 * The sessions of a trajectory hold the main session: a session of its own is declared by a fork
 * that names a part of a session the reading already reached ({@link Session.Fork}), so every
 * session hangs off the main session, the one session a trajectory reads without declaring it
 * ({@link Trajectory.mainSessionId}) — and the one the reading holds first
 * ({@link Session.Sessions}). An empty reading is no sessions, and has no tree.
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
 * const tree = SessionTree.make(sessions)
 *
 * // The main session is the root of it, and the session forked off its answer hangs under it.
 * tree.session.id // => "main"
 * SessionTree.sessionIds(tree) // => ["main", "reply"]
 * SessionTree.forksOf(Trajectory.mainSessionId)(tree).map((session) => session.id) // => ["reply"]
 * ```
 *
 * @see {@link SessionTree} for the tree it reads.
 * @see {@link Session.Sessions} for the sessions it is read from.
 * @see {@link dfs} and {@link sessionIds} for walking it.
 * @see {@link forksOf} for the sessions forked off one of them.
 * @category constructors
 */
export const make = <Config extends Trajectory.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): SessionTree<Config, E, R> => readTree(sessions);

/**
 * Every session of the tree, a session before the sessions forked off it.
 *
 * **When to use**
 *
 * Use to read every session of a trajectory in the order they were forked into, each with what it
 * ran on — to read them one at a time, or to fold what each of them came to — rather than walking
 * the forks of the tree from its root by hand.
 *
 * **Details**
 *
 * It is the depth-first walk of the tree, from its root down: a session before the sessions forked
 * off it, each with what was forked off it before the forks beside it. So the tree of the sessions
 * `main`, `reply` and `follow-up` — the last forked off `reply`, which was forked off `main` — is
 * read as those three in that order. A session is held once in a tree, so it is read once.
 *
 * **Example** (Reading every session of a tree, in the order it was forked into)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Session, SessionTree, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const answered = part.response(Response.makePart("text", { text: "A tree." }))
 *
 * // The main session asks and is answered, and two sessions forked off its answer ask again.
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.mainSession(),
 *     part.prompt(Prompt.make("What is a fork?")),
 *     answered,
 *     part.subSession("reply", { fork: answered.uuid }),
 *     part.subSession("aside", { fork: answered.uuid })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 * const tree = SessionTree.make(sessions)
 *
 * // Each session is read where it is found, with what it ran on.
 * SessionTree.dfs(tree).map((session) => session.id) // => ["main", "reply", "aside"]
 * ```
 *
 * @see {@link SessionTree} for the tree it walks.
 * @see {@link sessionIds} for the ids of the sessions it reads.
 * @see {@link forksOf} for the sessions forked off one of them.
 * @category combinators
 */
export const dfs = <Config extends Trajectory.AnyConfig, E, R>(
  tree: SessionTree<Config, E, R>,
): ReadonlyArray<Session.Session<Config, E, R>> => readDfs(tree);

/**
 * The id of every session of the tree, a session before the sessions forked off it.
 *
 * **When to use**
 *
 * Use to read the sessions of a trajectory in the order they were forked into where nothing of them
 * but the id is needed — to list them with each under the one it continues from — rather than
 * reading the sessions themselves ({@link dfs}).
 *
 * **Details**
 *
 * The ids are those of the sessions {@link dfs} reads, in the order it reads them: a session before
 * the sessions forked off it, each with what was forked off it before the forks beside it. So the
 * tree of `main`, `reply` and `follow-up` — the last forked off `reply`, which was forked off
 * `main` — is read as `["main", "reply", "follow-up"]`. A session is held once in a tree, so an id
 * is read once.
 *
 * **Example** (Reading the ids of a tree of sessions)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Session, SessionTree, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const answered = part.response(Response.makePart("text", { text: "A tree." }))
 * const answeredAgain = part.response(Response.makePart("text", { text: "A branch." }), {
 *   sessionId: "reply"
 * })
 *
 * // The main session asks and is answered, a session forked off the answer asks again, and a
 * // session forked off that answer asks once more.
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.mainSession(),
 *     part.prompt(Prompt.make("What is a fork?")),
 *     answered,
 *     part.subSession("reply", { fork: answered.uuid }),
 *     part.prompt(Prompt.make("And what does it hold?"), { sessionId: "reply" }),
 *     answeredAgain,
 *     part.subSession("follow-up", { fork: answeredAgain.uuid })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 *
 * SessionTree.sessionIds(SessionTree.make(sessions)) // => ["main", "reply", "follow-up"]
 * ```
 *
 * @see {@link SessionTree} for the tree it is read from.
 * @see {@link dfs} for the sessions it reads the ids of.
 * @see {@link forksOf} for the sessions forked off one of them.
 * @category combinators
 */
export const sessionIds = <Config extends Trajectory.AnyConfig, E, R>(
  tree: SessionTree<Config, E, R>,
): ReadonlyArray<string> => dfs(tree).map((session) => session.id);

/**
 * The sessions the tree holds as forked directly off the session given.
 *
 * **When to use**
 *
 * Use to find the sessions that continue one session — what was forked off it — rather than reading
 * every session of a trajectory for the ones whose `forkedFrom` names it.
 *
 * **Details**
 *
 * The session may be held anywhere in the tree, and the sessions are read in the order the tree
 * holds them. Only the sessions forked off it are read, not the sessions forked off those: the
 * whole of the tree is what {@link dfs} reads. A session nothing was forked off — the main session,
 * and a session none continues — has none forked off it, and so does an id the tree does not hold.
 *
 * **Example** (Reading the sessions forked off one session)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Session, SessionTree, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const answered = part.response(Response.makePart("text", { text: "A tree." }))
 *
 * // The main session asks and is answered, and the sessions forked off its answer ask again.
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.mainSession(),
 *     part.prompt(Prompt.make("What is a fork?")),
 *     answered,
 *     part.subSession("reply", { fork: answered.uuid }),
 *     part.subSession("aside", { fork: answered.uuid })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 * const tree = SessionTree.make(sessions)
 *
 * SessionTree.forksOf("main")(tree).map((session) => session.id) // => ["reply", "aside"]
 * SessionTree.forksOf("reply")(tree) // => []
 * ```
 *
 * @see {@link SessionTree} for the tree it is read from.
 * @see {@link dfs} for every session of it.
 * @see {@link Session.Session.forkedFrom} for the session one of them was forked off.
 * @category combinators
 */
export const forksOf =
  (id: string) =>
  <Config extends Trajectory.AnyConfig, E, R>(
    tree: SessionTree<Config, E, R>,
  ): ReadonlyArray<Session.Session<Config, E, R>> =>
    readForks(id)(tree);
