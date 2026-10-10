/**
 * Reads the sessions of a trajectory and how they derive from one another.
 *
 * A trajectory records sessions as parts that carry an optional `session`
 * string, so several sessions can be interleaved in one stream. The data an
 * extension recorded about a part belongs to that part's session: an extension
 * part carries no session of its own, and the session is read from the parts its
 * `attach` names. A session may also continue from an earlier one: a fork, a
 * resumed session, or a sub-agent spawned by a parent. That relation is recorded
 * by a `SessionPart`, whose `fork` names the part the new session continues from,
 * and the parent session is read off that part.
 *
 * The graph is a forest, because a session has at most one `fork`. This module
 * walks it: {@link parent} reads the edge, {@link of} streams a session
 * together with what it inherited, and {@link children} reads the reverse view.
 */

import { Effect, Predicate, Stream } from "effect";
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
 * A part is selected by the session it belongs to: a message part by the
 * `session` it carries, and an extension part by the session of the parts its
 * `attach` names. The result is the session's own timeline and does not include
 * what it inherited. Use {@link of} to read what a session inherited as well.
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
    lineage.select(id, trajectory);

/**
 * Reads every session of a trajectory as a trajectory of its own.
 *
 * **When to use**
 *
 * Use to split a recording that interleaves several sessions into the sessions it
 * holds, such as to analyze, replay or display each agent of a multi-agent
 * recording on its own.
 *
 * **Details**
 *
 * The whole recording is consumed once, and the sessions it holds are returned as
 * a record keyed by their identifiers: a session a `SessionPart` declares, as well
 * as one only the parts of the recording name. Each entry is the session together
 * with what it inherited, as {@link of} streams it: the parts of each ancestor
 * up to the part the next session is forked from, followed by the session's own
 * parts. A session therefore shares what it inherited with the one it forked from:
 * a part recorded under one session appears in the entry of every session that read
 * it. A part that belongs to no session, such as a message part that carries none,
 * is left out rather than given a key of its own. Parts are in the order they were
 * recorded, and the sessions are keyed in the order they first appear. A cycle in
 * the derivation is reported as {@link TrajectoryError} rather than followed.
 *
 * Each trajectory is bound to the recording it was read from: it carries the
 * toolkit, the metadata and the extension kit of the trajectory it was split off,
 * and its parts are held in memory rather than read from the recording again, so a
 * session can be consumed more than once. Splitting a recording is eager for that
 * reason: the sessions a recording holds are only known once it has been read.
 *
 * **Example** (Splitting a multi-agent recording into its sessions)
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
 *     Trajectory.sessionPart("b", { fork: hello.uuid }),
 *     Trajectory.PromptPart.make({ messages: Prompt.make("Continue").content, session: "b" })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.all(trajectory))
 * Object.keys(sessions) // => ["a", "b"]
 * const parts = await Effect.runPromise(Stream.runCollect(sessions["b"]))
 * Array.from(parts, (part) => part._tag) // => ["Session", "Prompt", "Session", "Prompt"]
 * ```
 *
 * @see {@link of} for the session one entry of the record holds.
 * @see {@link select} for a session's own parts without what it inherited.
 * @category combinators
 */
export const all = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Effect.Effect<Record<string, Trajectory.Trajectory<Tools, Exts>>, TrajectoryError> => {
  const { toolkit, metadata, extkit } = trajectory;

  return Effect.map(lineage.all(trajectory), (partsBySession) => {
    const sessions: Record<string, Trajectory.Trajectory<Tools, Exts>> = {};

    for (const [id, parts] of Object.entries(partsBySession)) {
      sessions[id] = Object.assign(Stream.fromIterable(parts), { toolkit, metadata, extkit });
    }

    return sessions;
  });
};

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
 * parts. A part belongs to the session by the `session` it carries or, for an
 * extension part, by the session of the parts it is attached to, so the data an
 * extension recorded about a session's parts is streamed with them; pipe the
 * result through `Trajectory.messages` for the trajectory data alone. A `fork`
 * that names a part absent from the loaded recording inherits nothing, and a
 * session that is never declared streams its own parts. A cycle is reported as
 * {@link TrajectoryError} rather than followed.
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
