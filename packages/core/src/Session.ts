import { ByteStore } from "@trajs/utils";
import { Effect, type Stream } from "effect";

import * as Config from "#/Config.ts";
import { read } from "#/internal/session.ts";
import * as Trajectory from "#/Trajectory.ts";

import type { TrajectoryError } from "./TrajectoryError.ts";

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
 * - `stream` is what it ran on, read out of a cache of the trajectory, so it can be
 *   iterated as often as it is asked for.
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
 * reads them again. A session's stream holds the parts that state its id, and the metric
 * parts attached to them, in the order the trajectory holds them. The main session is the
 * one session read without a declaration, and a part naming another session the
 * trajectory does not declare fails the reading.
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
  MainSession<
    Config,
    E | TrajectoryError | ByteStore.ByteStoreError,
    R | Config.DecodingServices<Config>
  >,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.EncodingServices<Config> | Config.DecodingServices<Config> | ByteStore.ByteStore
> {
  return yield* read(trajectory);
});
