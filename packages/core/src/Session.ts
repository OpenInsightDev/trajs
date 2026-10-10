/**
 * Reads the sessions of a trajectory and how they derive from one another.
 *
 * A trajectory records sessions as parts that carry an optional `session`
 * string, so several sessions can be interleaved in one stream. A session may
 * also continue from an earlier one: a fork, a resumed session, or a sub-agent
 * spawned by a parent. That relation is recorded by a `SessionPart`, whose
 * `fork` names the part the new session continues from, and the parent session
 * is read off that part.
 *
 * The graph is a forest, because a session has at most one `fork`. This module
 * walks it: {@link parent} reads the edge, {@link of} streams a session
 * together with what it inherited, and {@link children} reads the reverse view.
 */

import { Predicate, Stream } from "effect";
import type { Tool } from "effect/ai";
import type * as Extension from "#/Extension.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";
import * as lineage from "#/internal/session.ts";

/**
 * Streams the session parts of a trajectory.
 *
 * **When to use**
 *
 * Use to read the sessions a trajectory declares, without walking their
 * derivation edges.
 *
 * @see {@link of} for a session together with what it inherited.
 * @category combinators
 */
export const parts = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<Trajectory.SessionPart, TrajectoryError> =>
  trajectory.pipe(
    Stream.filter((part): part is Trajectory.SessionPart => Predicate.isTagged("Session")(part)),
  );

/**
 * Streams the parts recorded under a session.
 *
 * **When to use**
 *
 * Use to read a single session out of an interleaved recording, such as to
 * inspect, evaluate or replay one agent and leave the sessions recorded
 * alongside it aside.
 *
 * **Details**
 *
 * Parts are selected by the `session` they carry, so the result is the
 * session's own timeline and does not include what it inherited. Parts that
 * carry no session are not selected. Use {@link of} to read what a session
 * inherited as well.
 *
 * **Example** (Reading one session out of an interleaved recording)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Session, Trajectory } from "@trajs/core"
 *
 * const part = (text: string, session: string) =>
 *   Trajectory.PromptPart.make({ messages: Prompt.make(text).content, session })
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(part("Hello", "a"), part("Hi", "b"), part("Continue", "a"))
 * )
 *
 * const selected = await Effect.runPromise(Stream.runCollect(Session.select("a")(trajectory)))
 * selected.length // => 2
 * ```
 *
 * @see {@link of} for a session together with what it inherited.
 * @category combinators
 */
export const select =
  (id: string) =>
  <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
    trajectory: Trajectory.Trajectory<Tools, Exts>,
  ): Stream.Stream<Trajectory.Part<Tools, Exts>, TrajectoryError> =>
    trajectory.pipe(Stream.filter((part) => part.session === id));

/**
 * Streams the session a session continues from.
 *
 * **When to use**
 *
 * Use to read the derivation edge of a session, such as to inspect the agent
 * tree one level at a time.
 *
 * **Details**
 *
 * The parent is the `session` of the part the declaration is forked from, so it
 * is not stored redundantly. The parent is emitted at most once, and consuming
 * stops once the session's declaration is reached. A session that declares no
 * `fork`, a session that is not declared at all, and a `fork` that names a part
 * absent from the loaded recording emit nothing; a session forked from itself
 * does too.
 *
 * @see {@link of} for a session together with what it inherited.
 * @see {@link children} for the reverse view.
 * @category combinators
 */
export const parent =
  (id: string) =>
  <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
    trajectory: Trajectory.Trajectory<Tools, Exts>,
  ): Stream.Stream<string, TrajectoryError> =>
    lineage.parent(id, trajectory);

/**
 * Streams the sessions a session is the parent of.
 *
 * **When to use**
 *
 * Use to read how many sessions a session branched into, such as to draw the
 * agent tree downward.
 *
 * **Details**
 *
 * The reverse of {@link parent}, computed from the edges: the format stores the
 * child-to-parent direction only. A child is emitted once its declaration is
 * reached, and the whole recording is consumed, because a child can be declared
 * anywhere. A child is reported even when the session it forks from has no parts
 * of its own.
 *
 * @see {@link parent} for the session a session continues from.
 * @category combinators
 */
export const children =
  (id: string) =>
  <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
    trajectory: Trajectory.Trajectory<Tools, Exts>,
  ): Stream.Stream<string, TrajectoryError> =>
    lineage.children(id, trajectory);

/**
 * Streams a session: its own parts, preceded by what it inherited.
 *
 * **When to use**
 *
 * Use to read everything a session ran on, including the parts it inherited
 * from the session it forked from.
 *
 * **Details**
 *
 * Parts are held while the stream is consumed and released once the session's
 * declaration is reached, where the inherited parts are resolved from what was
 * held. Only the parts up to the declaration are held, so reading a session
 * near the start of a long recording does not materialize the whole of it.
 *
 * The result is each ancestor's parts up to and including the part the next
 * session is forked from, ordered from the root, followed by the session's own
 * parts. A `fork` that names a part absent from the loaded recording inherits
 * nothing, and a session that is never declared streams its own parts. Every
 * part of the lineage is returned; filter it to the messages with `Prompt` and
 * `Response` when that is what is wanted.
 * A cycle is reported as {@link TrajectoryError} rather than followed.
 *
 * **Example** (Reconstructing what a forked session inherited)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Session, Trajectory } from "@trajs/core"
 *
 * const hello = Trajectory.PromptPart.make({ messages: Prompt.make("Hello").content, session: "a" })
 * const trajectory = Trajectory.make(
 *   Stream.make(
 *     Trajectory.sessionPart("a"),
 *     hello,
 *     Trajectory.sessionPart("b", { fork: hello.uuid })
 *   )
 * )
 *
 * const parts = await Effect.runPromise(Stream.runCollect(Session.of("b")(trajectory)))
 * Array.from(parts, (part) => part._tag) // => ["Session", "Prompt", "Session"]
 * ```
 *
 * @see {@link select} for a session's own parts without what it inherited.
 * @see {@link parent} for the session a fork reads from.
 * @category combinators
 */
export const of =
  (id: string) =>
  <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
    trajectory: Trajectory.Trajectory<Tools, Exts>,
  ): Stream.Stream<Trajectory.Part<Tools, Exts>, TrajectoryError> =>
    lineage.of(id, trajectory);
