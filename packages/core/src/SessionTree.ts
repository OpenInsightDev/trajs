import * as Config from "#/Config.ts";
import { readDfs, readForks, readTree } from "#/internal/tree.ts";
import type * as Session from "#/Session.ts";

export interface SessionTree<Config extends Config.AnyConfig, E = never, R = never> {
  readonly session: Session.Session<Config, E, R>;
  readonly forks: ReadonlyArray<SessionTree<Config, E, R>>;
}

export const make = <Config extends Config.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): SessionTree<Config, E, R> => readTree(sessions);

export const dfs = <Config extends Config.AnyConfig, E, R>(
  tree: SessionTree<Config, E, R>,
): ReadonlyArray<Session.Session<Config, E, R>> => readDfs(tree);

export const sessionIds = <Config extends Config.AnyConfig, E, R>(
  tree: SessionTree<Config, E, R>,
): ReadonlyArray<string> => dfs(tree).map((session) => session.id);

export const forksOf =
  (id: string) =>
  <Config extends Config.AnyConfig, E, R>(
    tree: SessionTree<Config, E, R>,
  ): ReadonlyArray<Session.Session<Config, E, R>> =>
    readForks(id)(tree);
