/**
 * The state and the predicates {@link Session.main} reads a trajectory through: the parts
 * a session holds, and what the parts of a trajectory state of the sessions they name
 * before the tree is built.
 *
 * Nothing here is published: a program reaches the reading through {@link Session.main}.
 */

import { Stream } from "effect";

import type * as Config from "#/Config.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";

/** A part of a session, which is every part of a trajectory but the declaration of one. */
export type Part<Config extends Config.AnyConfig> = Exclude<
  Trajectory.Part<Config>,
  Trajectory.SessionPart<Config["extrakit"]>
>;

/** What the declaration of a session states of the session it places in the tree. */
export interface Declared {
  /** The session it continues from, named by the part it continues from. */
  readonly session: string;
  /** The `uuid` of the part it continues from. */
  readonly fork: string;
}

/** What the parts of a trajectory state of the sessions they name, before the tree is built. */
export interface Reading {
  /** The session each part a session continues from was produced in, by the part's `uuid`. */
  readonly producing: Map<string, string>;
  /** The session each part was produced in, by the part's `uuid`, for the metrics attached to it. */
  readonly contained: Map<string, string>;
  /** The parts of each session that named it before the declaration reading it. */
  readonly named: Set<string>;
  /** What each declared session states, by id, in the order the trajectory declares them. */
  readonly declared: Map<string, Declared>;
}

/** The reading a trajectory starts from: no part read yet. */
export const reading = (): Reading => ({
  producing: new Map(),
  contained: new Map(),
  named: new Set(),
  declared: new Map(),
});

/**
 * Whether a part is one a session holds: every part but a declaration, which names the
 * session it declares rather than being a part of it.
 */
export const isPart = <Config extends Config.AnyConfig>(
  part: Trajectory.Part<Config>,
): part is Part<Config> => part._tag !== "Session";

/**
 * Whether a part belongs to the session given: a part states the session it was produced
 * in, and a part stating none belongs to the main session. A metric part names no session
 * and belongs to the sessions of the parts it is attached to.
 */
export const belongsTo = <Config extends Config.AnyConfig>(
  part: Part<Config>,
  id: string,
  contained: ReadonlyMap<string, string>,
): boolean => {
  switch (part._tag) {
    case "Metric":
      return part.metric.data.attach.some(
        (attached) => attached === id || contained.get(attached) === id,
      );

    case "Prompt":
    case "Response":
    case "Event":
      return (part.sessionId ?? Trajectory.mainSessionId) === id;
  }
};

/** The parts of one session, read out of the cache of a trajectory as often as asked for. */
export const streamOf = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  contained: ReadonlyMap<string, string>,
  id: string,
): Session.SessionStream<Config, E, R> =>
  trajectory.pipe(
    Stream.filter(isPart<Config>),
    Stream.filter((part) => belongsTo(part, id, contained)),
  );

/**
 * The session named by a part and never declared by the trajectory, where one is:
 * the main session is the one session read without a declaration.
 */
export const undeclared = (state: Reading): string | undefined =>
  [...state.named].find((id) => id !== Trajectory.mainSessionId && !state.declared.has(id));
