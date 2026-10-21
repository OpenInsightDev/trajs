/**
 * The sessions of a trajectory, and the forks that relate them.
 *
 * A trajectory carries the parts of all its sessions in one stream (see
 * {@link Trajectory}), so its sessions are read from that stream rather than from a
 * structure built apart from it: {@link toSessions} reads a trajectory as the
 * {@link Sessions} it declares, {@link of} reads the parts of one session by its id,
 * and a session forked off another continues from it through
 * {@link Session.forkedFrom} rather than repeating its parts.
 */

import { type Option, Stream } from "effect";

import { find, read } from "#/internal/sessions.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A part of a trajectory a session continues from: a prompt, a response, or the
 * declaration of a session.
 *
 * **When to use**
 *
 * Use to type the part of another session a session carries on from — where it was
 * started — rather than every part a trajectory holds.
 *
 * **Details**
 *
 * A session produces the prompts it was given, the responses it returned, and the
 * declaration that names it (see {@link Trajectory.Part}), and what a session forked
 * off it inherited is those parts up to and including the one a `fork` names. The
 * parts a kit contributes of its own — the events of a trajectory, and its metrics —
 * are read with the parts they are attached to, so they are not a part a session
 * continues from and a `fork` never names one.
 *
 * @see {@link Fork} for the session a session forked from and the part it continues from.
 * @see {@link Trajectory.Part} for every part a trajectory holds.
 * @category models
 */
export type ForkPart<Config extends Trajectory.AnyConfig> =
  | Trajectory.PromptPart<Config["extrakit"]>
  | Trajectory.SessionPart<Config["extrakit"]>
  | Trajectory.ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>;

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
 * `session` is the session that produced `part`, and the parts it produced up to and
 * including that part are what this session inherited from it; the ones after are the
 * parts it produced for itself. `part` is the {@link ForkPart} a
 * {@link Trajectory.SessionPart}'s `fork` named by `uuid`.
 *
 * A session that continues from nothing has no `fork`, and its
 * {@link Session.forkedFrom} is `None`. A `fork` naming a part the trajectory does not
 * hold by the time it is read is not a session forked from nothing: the reading fails
 * with a {@link TrajectoryError} (see {@link toSessions}).
 *
 * @see {@link Session.forkedFrom} for the fork a session is read with.
 * @see {@link ForkPart} for the parts a fork names.
 * @see {@link Trajectory.SessionPart} for the part that produces one.
 * @category models
 */
export interface Fork<Config extends Trajectory.AnyConfig, E = never, R = never> {
  readonly session: Session<Config, E, R>;
  readonly part: ForkPart<Config>;
}

/**
 * One session of a trajectory, as the trajectory produces it: the parts it produced,
 * the session it forked from, and the sessions forked off it.
 *
 * **When to use**
 *
 * Use to follow a trajectory's sessions as they are produced — to show sessions
 * appearing and forking, or to read the parts of one session as they arrive.
 *
 * **Details**
 *
 * A session is emitted where the trajectory declares it — the `SessionPart` that names
 * it — or, for a session whose first part is not a declaration, where the trajectory
 * first names it. `forkedFrom` is the session that produced the part this one
 * continues from, and this session is emitted into that one's `forkedBy`; a
 * declaration with no `fork` continues from nothing, and its session is a root. A
 * trajectory that declares a session after the parts it produced, or reaches a session
 * before the part it continues from, is one the reading fails with (see
 * {@link toSessions}).
 *
 * `parts` are the parts this session produced — those of the trajectory that name it,
 * in order, beginning with the `SessionPart` that declared it, or the part the
 * trajectory first named it by. What a session inherited from the one it forked from
 * is among that session's parts, not these ({@link Fork}). A part that names no session
 * — a metric part, or whatever else a kit produces apart from a session — is read with
 * the parts it is attached to and is on no session's `parts`. `forkedBy` is a
 * {@link Sessions} of its own, since a session can be forked from again at any point
 * and is emitted before the sessions forked off it are known.
 *
 * `parts` and `forkedBy` are read from the trajectory the session was produced in: they
 * fail with `E` on top of the {@link TrajectoryError} a produced trajectory fails with,
 * and require the services `R` names. Each is a reading of its own, served by the
 * reading of the trajectory that emitted the session (see {@link toSessions}), so the
 * parts of a session are taken by one reader rather than read by each.
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
 * A session of a trajectory, with whatever kits it was produced with.
 *
 * **When to use**
 *
 * Use to type a session that is read for itself alone, without the kits its parts
 * were produced with, and without naming a failure or a requirement of its own.
 *
 * @see {@link Session} for a session of a known config.
 * @category models
 */
export type AnySession = Session<Trajectory.AnyConfig, any, any>;

/**
 * The sessions of a trajectory, as they are produced: the ones it declared, and
 * through {@link Session.forkedBy} the ones forked off them.
 *
 * **When to use**
 *
 * Use to read a trajectory's sessions as they are produced, from the sessions it
 * declared first down to the ones forked off them.
 *
 * **Details**
 *
 * Reading sessions reads the trajectory: they arrive as it declares them, each with a
 * stream of the parts it produced and a stream of the sessions forked off it, and a
 * session nothing declares arrives where the trajectory first names it. A session can
 * be forked from again at any point, so a session arrives before the ones forked off it
 * do, and a stream of sessions ends when the trajectory ends — which is when the last
 * fork is known. What has been read at any point is therefore the part of a
 * trajectory's sessions produced so far.
 *
 * The stream fails with `E` on top of the {@link TrajectoryError} a produced trajectory
 * fails with, and requires the services `R` names.
 *
 * @see {@link toSessions} for reading a trajectory as the sessions it produces.
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
 * without the kits their parts were produced with, and without naming a failure or a
 * requirement of their own.
 *
 * @see {@link Sessions} for the sessions of a known config.
 * @category models
 */
export type AnySessions = Sessions<Trajectory.AnyConfig, any, any>;

/**
 * Reads a trajectory as the sessions it produces.
 *
 * **When to use**
 *
 * Use to read a trajectory by its sessions rather than by the single order its parts
 * arrived in.
 *
 * **Details**
 *
 * The stream carries the sessions the trajectory declared as roots, each emitted where
 * it was declared, with the sessions forked off each of them as its
 * {@link Session.forkedBy}: a trajectory's sessions are read as the tree of forks they
 * are.
 *
 * Two things are taken to hold, neither of which can be waited for: a session is
 * declared before the parts it produced, and a `fork` names a part the trajectory holds
 * by the time the declaration reading it is read. A session whose first part is not a
 * declaration is therefore emitted as a root where the trajectory first names it. A
 * trajectory that declares a session after the parts it produced, or reaches a session
 * before the part it continues from — which is what a cycle of forks is — fails with
 * the {@link TrajectoryError} that names the session and what is wrong with it.
 *
 * The trajectory is read once: a session is read as the trajectory is produced rather
 * than once it has ended, and the parts of sessions nobody reads are held for as long
 * as the trajectory is read.
 *
 * The stream fails with `E` on top of the {@link TrajectoryError} a produced trajectory
 * fails with, and requires the services `R` names. Reading sessions reads the
 * trajectory, so two readings of the returned stream are two readings of it.
 *
 * **Example** (Reading a trajectory as the sessions it declares)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Prompt, Session, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const asked = part.prompt(Prompt.make("What is a fork?"), { sessionId: "asking" })
 * const forking = part.session("reply", { fork: asked.uuid })
 *
 * const trajectory = Stream.make(part.session("asking"), asked, forking)
 *
 * const roots = Array.from(await Effect.runPromise(Stream.runCollect(Session.toSessions(trajectory))))
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
export const toSessions = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Sessions<Config, E, R> => read(trajectory);

/**
 * The parts one session of a trajectory produced.
 *
 * **When to use**
 *
 * Use when one session of a trajectory is to be read on its own — to show what it
 * did, to count or score it, or to reload it without the rest.
 *
 * **Details**
 *
 * The parts emitted are the ones the session `id` names produced, in order, beginning
 * with the `SessionPart` that declared it. Reading them reads the sessions only as far
 * as the session itself — an id names one session — and stops there: what later
 * sessions produce is left to be read as it arrives, and a trajectory that produces no
 * such session yields no part at all.
 *
 * A session forked off another continues from one of that session's parts instead of
 * repeating it, so those parts are not among these: what a session inherited is read
 * from the session it forked from.
 *
 * The stream fails with `E` on top of the {@link TrajectoryError} a produced trajectory
 * fails with, and requires the services `R` names.
 *
 * @see {@link toSessions} for the sessions it is found among.
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
