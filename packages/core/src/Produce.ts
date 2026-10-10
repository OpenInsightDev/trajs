/**
 * Records what a program does with an AI model as a trajectory.
 *
 * A recording is produced while the sessions it holds are run: a session is
 * declared, the prompts it was given and the response parts it produced are
 * appended to it, and what was appended is the trajectory. {@link produce} runs
 * a program against a {@link Producer} and returns what it recorded,
 * {@link transform} records a session that is already a stream, and {@link merge}
 * records several such sessions as one trajectory.
 *
 * The parts written here are the ones a recording is read from:
 * {@link Trajectory.messages} and `View.prompt` read a trajectory's data, and
 * `Session.of` reads one session out of it together with what it inherited.
 */

import type { Effect, Stream } from "effect";
import type { Prompt, Tool, Response, Toolkit } from "effect/ai";
import * as Ext from "#/Extension.ts";
import * as Extkit from "#/Extensionkit.ts";
import * as Trajectory from "#/Trajectory.ts";

type SessionStream<Tools extends Record<string, Tool.Any>, E, R> = Stream.Stream<
  Prompt.Prompt | Response.AllParts<Tools>,
  E,
  R
>;

/**
 * Records a stream of the messages a session exchanged as a trajectory.
 *
 * **When to use**
 *
 * Use when the prompts a model was given and the parts it returned are already a
 * stream, and the recording around them should be added rather than the stream
 * rebuilt.
 *
 * **Details**
 *
 * Each element is recorded as the part that carries it: a prompt as a
 * {@link Trajectory.PromptPart} and a response part as a
 * {@link Trajectory.ResponsePart}, in the order the stream gives them. No session
 * is declared and the parts carry none, because a stream of one session does not
 * say which session it is: use {@link merge} to record several, or
 * {@link produce} to record one while it is run.
 *
 * @see {@link merge} for recording several sessions as one trajectory.
 * @see {@link produce} for recording a session while it is run.
 * @category constructors
 */
export const transform = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Ext.Any>,
  E,
  R,
>(
  stream: SessionStream<Tools, E, R>,
): Trajectory.Trajectory<Tools, Exts, E, R> => {
  throw new Error("Not implemented");
};

type Session<Tools extends Record<string, Tool.Any>, E, R> = Readonly<{
  id: string;
  stream: SessionStream<Tools, E, R>;
}>;

/**
 * Records several sessions as one trajectory.
 *
 * **When to use**
 *
 * Use when the sessions of a recording are already streams and belong together,
 * such as a sub-agent's session recorded beside the session that spawned it.
 *
 * **Details**
 *
 * The parts of each session carry the `id` it is given as their `session`, so the
 * sessions stay attributable once they are interleaved in one stream and one is
 * read back out with `Session.select(id)`. The parts of a session keep the order
 * of its stream.
 *
 * @see {@link transform} for recording one session.
 * @see {@link produce} for recording sessions while they are run.
 * @category combinators
 */
export const merge = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Ext.Any>,
  E,
  R,
>(
  ...sessions: Session<Tools, E, R>[]
): Trajectory.Trajectory<Tools, Exts, E, R> => {
  throw new Error("Not implemented");
};

/**
 * A session that is recorded while it is run.
 *
 * **When to use**
 *
 * Use to append what a session sent and received as it happens, rather than
 * recording a stream that is already complete.
 *
 * **Details**
 *
 * The session is declared by {@link Producer.createSession}, and every message
 * enqueued through it is recorded as the part that carries it, attributed to the
 * session it was enqueued for and in the order it was enqueued. Enqueuing appends
 * to the recording being produced, so nothing is returned to read: the recording
 * is the trajectory {@link produce} returns.
 *
 * @see {@link Producer} for the sessions a program records into.
 * @category models
 */
export type ProduceSession<Tools extends Record<string, Tool.Any>> = Readonly<{
  /**
   * Identifier of the part of this session that another session names as its
   * `fork` to continue from it.
   */
  uuid: string;
  /**
   * Appends a message to the session.
   *
   * **Details**
   *
   * A prompt is recorded as a {@link Trajectory.PromptPart} and a response part
   * as a {@link Trajectory.ResponsePart}. Nothing else is recorded, so the parts
   * of a turn are enqueued as the model produces them.
   */
  enqueue: (message: Prompt.Prompt | Response.AllParts<Tools>) => Effect.Effect<void>;
}>;

/**
 * Records the sessions of a program as a trajectory.
 *
 * **When to use**
 *
 * Use as what a program is given to record into, rather than recording streams
 * that are already complete.
 *
 * **Details**
 *
 * A session is opened with `createSession` and what happens in it is recorded
 * through the returned {@link ProduceSession}, so a producer is the handle a
 * program writes its sessions with. The recording itself is the trajectory
 * {@link produce} returns.
 *
 * @see {@link ProduceSession} for what a session is recorded through.
 * @category models
 */
export type Producer<Tools extends Record<string, Tool.Any>> = Readonly<{
  /**
   * Declares a session and opens it for recording.
   *
   * **Details**
   *
   * `id` names the session: it is the `session` its parts carry, and the
   * identifier `Session.select(id)` and `Session.of(id)` are given to read the
   * session back out. `fork` continues another session by naming the part of it
   * the new session inherits up to and including, so a session opened without one
   * inherits nothing.
   */
  createSession: (options: { id: string; fork?: string }) => Promise<ProduceSession<Tools>>;
}>;

type ProduceFn<Tools extends Record<string, Tool.Any>> = (
  producer: Producer<Tools>,
) => Effect.Effect<void>;

/**
 * Runs a program and records what it does as a trajectory.
 *
 * **When to use**
 *
 * Use when a program drives the model and the recording should be produced while
 * it runs, rather than assembled from streams that are already complete.
 *
 * **Details**
 *
 * The function is given a {@link Producer}, so the sessions it opens and the
 * messages it enqueues are what the returned trajectory holds, in the order they
 * were recorded. The program yields the recording rather than a value: it is run
 * for what it records, and the trajectory is the result of the call.
 *
 * The returned trajectory carries the `toolkit`, `extkit` and `metadata` given
 * here, so its parts are decoded and encoded against the same tools and
 * extensions they were recorded with.
 *
 * @see {@link Producer} for what the function records into.
 * @see {@link transform} for recording a stream instead of running a program.
 * @category constructors
 */
export const produce =
  <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Ext.Any>, E, R>(options: {
    toolkit: Toolkit.Toolkit<Tools>;
    extkit: Extkit.Extensionkit<Exts>;
    metadata: Trajectory.Metadata;
  }) =>
  (fn: ProduceFn<Tools>): Trajectory.Trajectory<Tools, Exts, E, R> => {
    throw new Error("Not implemented");
  };
