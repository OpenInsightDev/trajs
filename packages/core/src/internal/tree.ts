/**
 * The reading behind {@link SessionTree.make}, {@link SessionTree.dfs} and
 * {@link SessionTree.forksOf}: the sessions of a trajectory as the tree they were forked into, the
 * sessions it walks, and the forks of one session of it.
 *
 * Nothing here is published: a program reaches the tree through `SessionTree`.
 */

import { Option } from "effect";

import * as Config from "#/Config.ts";
import type * as Session from "#/Session.ts";
import type { SessionTree } from "#/SessionTree.ts";

/**
 * The tree the sessions given were forked into: the main session at its root, and every other session
 * under the one it states it was forked off.
 *
 * A session is forked off one session and the main session is forked off none, so every session of a
 * reading hangs under that one root — which is the one the reading holds first
 * ({@link Session.Sessions}).
 */
export const readTree = <Config extends Config.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): SessionTree<Config, E, R> => treeOf(sessions[0], forkedIn(sessions));

/** Every session of the tree, a session before the sessions forked off it. */
export const readDfs = <Config extends Config.AnyConfig, E, R>(
  tree: SessionTree<Config, E, R>,
): ReadonlyArray<Session.Session<Config, E, R>> => [tree.session, ...tree.forks.flatMap(readDfs)];

/**
 * The sessions the tree holds as forked directly off the session `id`, in the order it holds them:
 * none where the tree holds no session of that id, and none for a session nothing was forked off.
 */
export const readForks =
  (id: string) =>
  <Config extends Config.AnyConfig, E, R>(
    tree: SessionTree<Config, E, R>,
  ): ReadonlyArray<Session.Session<Config, E, R>> =>
    Option.match(sessionOf(id, tree), {
      onNone: () => [],
      onSome: (session) => session.forks.map((fork) => fork.session),
    });

/**
 * The sessions forked off each session, by the id of the session they state they were forked off.
 *
 * What is forked off each session is gathered before any of them is placed in the tree, so that
 * placing one does not read the sessions again for each of them.
 */
const forkedIn = <Config extends Config.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): ReadonlyMap<string, ReadonlyArray<Session.Session<Config, E, R>>> => {
  const forked = new Map<string, Array<Session.Session<Config, E, R>>>();

  for (const session of sessions) {
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
const treeOf = <Config extends Config.AnyConfig, E, R>(
  session: Session.Session<Config, E, R>,
  forked: ReadonlyMap<string, ReadonlyArray<Session.Session<Config, E, R>>>,
): SessionTree<Config, E, R> => ({
  session,
  forks: (forked.get(session.id) ?? []).map((fork) => treeOf(fork, forked)),
});

/**
 * The session `id` of the tree, wherever the tree holds it — or `None` where it holds no session of
 * that id.
 */
const sessionOf = <Config extends Config.AnyConfig, E, R>(
  id: string,
  tree: SessionTree<Config, E, R>,
): Option.Option<SessionTree<Config, E, R>> => {
  if (tree.session.id === id) {
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
