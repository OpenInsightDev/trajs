/**
 * The reading behind {@link SessionTree.fromSessions}, {@link SessionTree.sessionIds} and
 * {@link SessionTree.forksOf}: the sessions of a trajectory as the tree they were forked into, the
 * ids the tree holds, and the forks of one session of it.
 *
 * Nothing here is published: a program reaches the tree through `SessionTree`.
 */

import { Option } from "effect";

import type * as Session from "#/Session.ts";
import type { SessionTree } from "#/SessionTree.ts";
import * as Trajectory from "#/Trajectory.ts";

/**
 * The tree the sessions given were forked into: the main session as its root
 * ({@link Trajectory.mainSessionId}), and every other session under the one it states it was forked
 * off.
 *
 * A session is forked off one session and the main session is forked off none, so every session of
 * a trajectory hangs under that one root, which is what the record of its sessions holds.
 */
export const readTree = <Config extends Trajectory.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): SessionTree<Config> => treeOf(sessions[Trajectory.mainSessionId], forkedIn(sessions));

/**
 * Every session of the tree, a session before the sessions forked off it, in the order they are
 * held.
 */
export const readSessionIds = <Config extends Trajectory.AnyConfig>(
  tree: SessionTree<Config>,
): ReadonlyArray<string> => [tree.id, ...tree.forks.flatMap(readSessionIds)];

/**
 * The sessions the tree holds as forked directly off the session `id`, in the order it holds them:
 * none where the tree holds no session of that id, and none for a session nothing was forked off.
 */
export const readForks =
  (id: string) =>
  <Config extends Trajectory.AnyConfig>(tree: SessionTree<Config>): ReadonlyArray<string> =>
    Option.match(sessionOf(id, tree), {
      onNone: () => [],
      onSome: (session) => session.forks.map((fork) => fork.id),
    });

/**
 * The sessions forked off each session, by the id of the session they state they were forked off.
 *
 * What is forked off each session is gathered before any of them is placed in the tree, so that
 * placing one does not read the record of sessions again for each of them.
 */
const forkedIn = <Config extends Trajectory.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): ReadonlyMap<string, ReadonlyArray<Session.Session<Config, E, R>>> => {
  const forked = new Map<string, Array<Session.Session<Config, E, R>>>();

  for (const session of Object.values(sessions)) {
    const from = Option.getOrUndefined(Option.map(session.forkedFrom, (fork) => fork.session));

    // A session forked off none is the root of a tree: nothing is held under it.
    if (from === undefined) {
      continue;
    }

    const forks = forked.get(from) ?? [];

    forks.push(session);

    forked.set(from, forks);
  }

  return forked;
};

/** The tree of the session given, down to the sessions nothing was forked off. */
const treeOf = <Config extends Trajectory.AnyConfig, E, R>(
  session: Session.Session<Config, E, R>,
  forked: ReadonlyMap<string, ReadonlyArray<Session.Session<Config, E, R>>>,
): SessionTree<Config> => ({
  id: session.id,
  extra: session.extra,
  forks: (forked.get(session.id) ?? []).map((fork) => treeOf(fork, forked)),
});

/**
 * The session `id` of the tree, wherever the tree holds it — or `None` where it holds no session of
 * that id.
 */
const sessionOf = <Config extends Trajectory.AnyConfig>(
  id: string,
  tree: SessionTree<Config>,
): Option.Option<SessionTree<Config>> => {
  if (tree.id === id) {
    return Option.some(tree);
  }

  for (const fork of tree.forks) {
    const under = sessionOf(id, fork);

    if (Option.isSome(under)) {
      return under;
    }
  }

  return Option.none();
};
