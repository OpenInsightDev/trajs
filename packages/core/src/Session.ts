/**
 * The sessions of a trajectory, and the forks that relate them.
 *
 * A trajectory carries the parts of all its sessions in one stream (see
 * {@link Trajectory}), so its sessions are read from that stream rather than from a
 * structure built apart from it: {@link sessions} reads a trajectory as the
 * {@link Sessions} it declares, {@link of} reads the parts of one session by its id,
 * and a session forked off another continues from it through
 * {@link Session.forkedFrom} rather than repeating its parts.
 */

import { type Option, Stream } from "effect";

import { find, read } from "#/internal/sessions.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The session a session forked from, and the part of it that it continues from.
 *
 * **When to use**
 *
 * Use to follow a session back to the one it forked from — to show where a session
 * was started, or to read what it ran on before the parts of its own.
 *
 * **Details**
 *
 * `session` is the session that recorded `part`, and the parts it recorded up to and
 * including that part are what this session inherited from it; the ones after it are
 * the parts it recorded for itself. `part` is the part the `fork` of a
 * {@link Trajectory.SessionPart} named by `uuid`.
 *
 * A fork is read for the `fork` a declaration records: a session that continues from
 * nothing has none, and its {@link Session.forkedFrom} is `None`. A `fork` naming a
 * part the recording does not hold by the time it is read is not a session forked
 * from nothing: it is a recording whose sessions cannot be read, and the reading
 * fails with it (see {@link sessions}).
 *
 * @see {@link Session.forkedFrom} for the fork a session is read with.
 * @see {@link Trajectory.SessionPart} for the part that records one.
 * @category models
 */
export interface Fork<Config extends Trajectory.AnyConfig, E = never, R = never> {
  readonly session: Session<Config, E, R>;
  readonly part: Trajectory.Part<Config>;
}

/**
 * One session of a trajectory, as the trajectory records it: the parts it recorded,
 * the session it forked from, and the sessions forked off it.
 *
 * **When to use**
 *
 * Use to follow a trajectory's sessions as they are recorded — to show sessions
 * appearing and forking, or to read the parts of one session as they arrive.
 *
 * **Details**
 *
 * A session is emitted where the trajectory declares it, which is the
 * `SessionPart` that names it, or, for a session whose first part is not a
 * declaration, where the trajectory first names it: a session is declared before the
 * parts it recorded, so a session the trajectory has not declared by its first part
 * is one it never declares, and is a root rather than awaited to the end. `forkedFrom`
 * is the session that recorded the part this one continues from, and the session is
 * emitted into the `forkedBy` of that session; a declaration that records no `fork`
 * continues from nothing, and its session is a root. A recording that declares a
 * session after the parts it recorded, or reaches a session before the part it
 * continues from, is one the reading fails with (see {@link sessions}).
 *
 * `parts` are the parts this session recorded — the parts of the trajectory that
 * name it, in the order they were recorded — and begin with the `SessionPart` that
 * declared it, or, for a session nothing declares, with the part the trajectory first
 * named it by. What it inherited from the session it forked from is among that
 * session's parts rather than among these: {@link Fork} reads up to the part this
 * session continues from. A part that names no session — a metric part, or whatever
 * else a kit records apart from a session — is read with the parts it is attached to,
 * and is on no session's `parts`. `forkedBy` is a {@link Sessions} of its own, since a
 * session can be forked from again at any point: a session is emitted before the ones
 * forked off it are known, and every stream of sessions ends with the trajectory.
 *
 * `parts` and `forkedBy` are read from the trajectory the session was recorded in, so
 * they fail with `E` on top of the {@link TrajectoryError} a recorded trajectory fails
 * with, and require the services `R` names. Each is a reading of its own, served by
 * the reading of the trajectory that emitted the session (see {@link sessions}), so
 * the parts of a session are taken by one reader rather than read by each.
 *
 * @see {@link Fork} for the session this one forked from.
 * @see {@link Sessions} for the sessions of a trajectory as a whole.
 * @see {@link Trajectory.SessionPart} for the part that declares a session.
 * @category models
 */
export interface Session<Config extends Trajectory.AnyConfig, E = never, R = never> {
  readonly id: string;
  readonly forkedFrom: Option.Option<Fork<Config, E, R>>;
  readonly parts: Trajectory.TrajectoryStream<Config, E | TrajectoryError, R>;
  readonly forkedBy: Sessions<Config, E, R>;
}

/**
 * A session of a trajectory, with whatever kits it was recorded with.
 *
 * **When to use**
 *
 * Use to type a session that is read for itself alone, without the kits its parts
 * were recorded with, and without naming a failure or a requirement of its own.
 *
 * @see {@link Session} for a session of a known config.
 * @category models
 */
export type AnySession = Session<Trajectory.AnyConfig, any, any>;

/**
 * The sessions of a trajectory, as they are recorded: the ones it declared, and
 * through {@link Session.forkedBy} the ones forked off them.
 *
 * **When to use**
 *
 * Use to read a trajectory's sessions as they are recorded, from the sessions it
 * declared first down to the ones forked off them.
 *
 * **Details**
 *
 * Reading sessions reads the trajectory: they arrive as the trajectory declares them,
 * each with a stream of the parts it recorded and a stream of the sessions forked off
 * it, and a session nothing declares arrives where the trajectory first names it. A
 * session can be forked from again at any point, so a session arrives before the ones
 * forked off it do, and what a stream of sessions ends with is the trajectory
 * ending — which is when the last fork of the trajectory is known. What has been read
 * at any point is therefore the part of a trajectory's sessions that has been
 * recorded so far.
 *
 * The stream fails with `E` on top of the {@link TrajectoryError} a recorded
 * trajectory fails with, and requires the services `R` names.
 *
 * @see {@link sessions} for reading a trajectory as the sessions it records.
 * @see {@link Session} for one session of a trajectory.
 * @category models
 */
export type Sessions<Config extends Trajectory.AnyConfig, E = never, R = never> = Stream.Stream<
  Session<Config, E, R>,
  E | TrajectoryError,
  R
>;

/**
 * The sessions of a trajectory whose kits are not known.
 *
 * **When to use**
 *
 * Use to type the sessions of a trajectory that are read for themselves alone,
 * without the kits their parts were recorded with, and without naming a failure or a
 * requirement of their own.
 *
 * @see {@link Sessions} for the sessions of a known config.
 * @category models
 */
export type AnySessions = Sessions<Trajectory.AnyConfig, any, any>;

/**
 * Reads a trajectory as the sessions it records.
 *
 * **When to use**
 *
 * Use to read a trajectory by its sessions — to show the sessions of a recording and
 * how they forked from one another, or to read the parts one of them recorded —
 * rather than by the single order its parts arrived in.
 *
 * **Details**
 *
 * The stream carries the sessions the trajectory declared as roots, each emitted where
 * it was declared, and the sessions forked off each of them are its
 * {@link Session.forkedBy}: a trajectory's sessions are read as the tree of forks they
 * are.
 *
 * A recording is read against two things it is taken to hold, neither of which can be
 * waited for: a session is declared before the parts it recorded, and a `fork` names a
 * part the recording holds by the time the declaration reading it is read. A session
 * whose first part is not a declaration is therefore one the trajectory never
 * declares, and is emitted as a root where the trajectory first names it. A recording
 * that declares a session after the parts it recorded, or reaches a session before the
 * part it continues from — which is what a cycle of forks is, no session in it being
 * reachable without a fork into the future — fails with the {@link TrajectoryError}
 * that names the session and what is wrong with it.
 *
 * The trajectory is read once, and that one reading serves every stream handed out:
 * the parts of a session are routed to it as they are read, so the sessions of a
 * recording are read as it is recorded rather than once it has ended, and the parts of
 * one session are not held back by the sessions recorded around it. The parts of a
 * session are held until whoever reads that session takes them, so the parts of the
 * sessions nobody reads are held for as long as the trajectory is read. A `fork` names
 * the part it continues from by `uuid` rather than by session, so resolving one needs
 * the session that recorded that part: the reading remembers the `uuid` of every part
 * it reads.
 *
 * The stream fails with `E` on top of the {@link TrajectoryError} a recorded trajectory
 * fails with, and requires the services `R` names. Reading the sessions of a trajectory
 * reads it, so two readings of the returned stream are two readings of the trajectory.
 *
 * **Example** (Reading a recording as the sessions it declares)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Extra, Prompt, Session, Trajectory } from "@trajs/core"
 *
 * const extrakit = Extra.makeKit()
 *
 * const asked = Trajectory.promptPart(extrakit)({
 *   prompt: Prompt.make("What is a fork?"),
 *   sessionId: "asking"
 * })
 * const forking = Trajectory.sessionPart(extrakit)({ id: "reply", fork: asked.uuid })
 *
 * const trajectory = Stream.make(
 *   Trajectory.sessionPart(extrakit)({ id: "asking" }),
 *   asked,
 *   forking
 * )
 *
 * const roots = Array.from(await Effect.runPromise(Stream.runCollect(Session.sessions(trajectory))))
 * roots.map((session) => session.id) // => ["asking"]
 *
 * const forks = Array.from(await Effect.runPromise(Stream.runCollect(roots[0].forkedBy)))
 * forks.map((session) => session.id) // => ["reply"]
 * forks[0].forkedFrom.pipe(Option.map((from) => from.part.uuid === asked.uuid)) // => Some(true)
 * ```
 *
 * @see {@link Session} for one session of a trajectory.
 * @see {@link of} for reading the parts of one session by its id.
 * @category constructors
 */
export const sessions = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Sessions<Config, E, R> => read(trajectory);

/**
 * The parts one session of a trajectory recorded.
 *
 * **When to use**
 *
 * Use when one session of a trajectory is to be read on its own — to show what it
 * did, to count or score it, or to reload it without the rest.
 *
 * **Details**
 *
 * The parts emitted are the ones the session `id` names recorded, in the order it
 * recorded them, beginning with the `SessionPart` that declared it. Reading them
 * reads the sessions only as far as the session itself, since an id names one session,
 * and stops there: what the sessions after it record is left to be read as it arrives.
 * A trajectory that records no such session yields no part at all.
 *
 * A session forked off another continues from one of the parts of the session it
 * forked from instead of repeating it, so those parts are not among these: what a
 * session inherited is read from the session it forked from.
 *
 * The stream fails with `E` on top of the {@link TrajectoryError} a recorded trajectory
 * fails with, and requires the services `R` names.
 *
 * @see {@link sessions} for the sessions it is found among.
 * @see {@link Fork} for the part a session continues from.
 * @see {@link Session.parts} for the parts of a session already in hand.
 * @category combinators
 */
export const of =
  (id: string) =>
  <Config extends Trajectory.AnyConfig, E, R>(
    sessions: Sessions<Config, E, R>,
  ): Trajectory.TrajectoryStream<Config, E | TrajectoryError, R> =>
    find(id)(sessions).pipe(Stream.flatMap((session) => session.parts));
