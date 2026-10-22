/**
 * The reasons a trajectory fails with, and the error that carries them.
 *
 * A trajectory fails as a {@link TrajectoryError}, whose `reason` names what
 * failed: a response part the toolkit cannot encode or decode
 * ({@link ToolEncodeError}, {@link ToolDecodeError}), a session a trajectory does
 * not hold what reading it needs ({@link SessionError}), or a trajectory whose bytes
 * cannot be read or written ({@link ParseError}). Every reason says what failed in
 * its `message` and keeps what it was derived of as `cause`.
 */

import { Data, Formatter, Schema } from "effect";
import type { Toolkit } from "effect/ai";

const listed = (members: ReadonlyArray<string>): string =>
  members.length > 0 ? members.join(", ") : "none";

/**
 * The failure of encoding a response part with the toolkit a trajectory was
 * produced with.
 *
 * @see {@link TrajectoryError.encodeTool} for the error that carries it.
 * @category errors
 */
export class ToolEncodeError extends Data.TaggedError("ToolEncodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {
  override get message(): string {
    const tools = listed(Object.keys(this.toolkit.tools));

    return `Failed to encode a response part with the toolkit (${tools}): ${this.cause.message}`;
  }
}

/**
 * The failure of decoding a response part with the toolkit it is read with.
 *
 * @see {@link TrajectoryError.decodeTool} for the error that carries it.
 * @category errors
 */
export class ToolDecodeError extends Data.TaggedError("ToolDecodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {
  override get message(): string {
    const tools = listed(Object.keys(this.toolkit.tools));

    return `Failed to decode a response part with the toolkit (${tools}): ${this.cause.message}`;
  }
}

/**
 * What reading a session failed with.
 *
 * **Details**
 *
 * - `"unproduced-fork"`: the session continues from a part the trajectory does not
 *   hold, or one no session continues from — a part that is not a prompt, response or
 *   session part. A `fork` names a part produced before the declaration that reads it,
 *   so a session that continues from a part the trajectory has not reached cannot be
 *   read — which is also what a cycle of forks is, no session in it being reachable
 *   without a fork into the future.
 * - `"late-declaration"`: the session was declared after the parts it produced. A
 *   session is declared before the parts it produced, so there is no declaration
 *   left to wait for.
 * - `"undeclared-session"`: the session is named by a part of the trajectory, and no
 *   session part declares it. A session of its own is read only from the part that
 *   declares it; the main session is the one session that is read whether or not it is
 *   declared.
 *
 * @see {@link SessionError} for the error that carries one.
 * @category models
 */
export type SessionErrorReason = "unproduced-fork" | "late-declaration" | "undeclared-session";

/** What each reason says is wrong with the session it names, as {@link SessionError} words it. */
const sessionFailure: Record<SessionErrorReason, string> = {
  "unproduced-fork":
    "it continues from a part the trajectory does not hold, or one no session continues from",
  "late-declaration": "it was declared after the parts it produced",
  "undeclared-session": "it is named by a part, and no session part declares it",
};

/**
 * The failure of reading a session a trajectory does not hold what reading it
 * needs.
 *
 * **Details**
 *
 * `id` names the session and `reason` what is wrong with it, as
 * {@link SessionErrorReason} reads it: a trajectory that does not hold what reading a
 * session needs.
 *
 * @see {@link TrajectoryError.session} for the error that carries it.
 * @category errors
 */
export class SessionError extends Data.TaggedError("SessionError")<{
  id: string;
  reason: SessionErrorReason;
}> {
  override get message(): string {
    return `Failed to read session '${this.id}': ${sessionFailure[this.reason]}`;
  }
}

/**
 * The failure of reading or writing a trajectory.
 *
 * **Details**
 *
 * `cause` is what the trajectory failed with, as the layer that failed reported
 * it: the `SchemaError` of a part, of the header or of the metadata a trajectory
 * ends with, the failure of the codec the frame is carried in, or the description of
 * the bytes ending before a header or before that metadata.
 *
 * @see {@link TrajectoryError.parse} for the error that carries it.
 * @category errors
 */
export class ParseError extends Data.TaggedError("ParseError")<{
  cause: unknown;
}> {
  override get message(): string {
    return `Failed to read or write a trajectory: ${Formatter.format(this.cause)}`;
  }
}

/**
 * The failure a trajectory failed with, as the reason that names it.
 *
 * @see {@link TrajectoryError} for the error that carries it.
 * @category models
 */
export type TrajectoryErrorReason = ToolEncodeError | ToolDecodeError | SessionError | ParseError;

/**
 * The error a trajectory failed with, carrying the {@link TrajectoryErrorReason}
 * that names what failed.
 *
 * **Details**
 *
 * The reason travels as `cause`, and its own `message` is this error's, so what
 * a log or a `Cause.pretty` shows names the failure and, one level further
 * down, what the reason was derived of.
 *
 * @see {@link TrajectoryErrorReason} for the failures it carries.
 * @category errors
 */
export class TrajectoryError extends Data.TaggedError("TrajectoryError")<{
  reason: TrajectoryErrorReason;
}> {
  /**
   * The {@link TrajectoryErrorReason} this error was raised with, as the error's
   * `cause`.
   *
   * **Details**
   *
   * It is the reason itself rather than the failure the reason was derived of,
   * so a `cause` chain still names which reason it was, and the failure the
   * reason holds is reached through the reason's own `cause`.
   *
   * @see {@link TrajectoryErrorReason} for the failures a trajectory has reasons for.
   * @category errors
   */
  override readonly cause = this.reason;

  /**
   * The message of the reason this error was raised with.
   *
   * **Details**
   *
   * The wrapper adds nothing to it, so what a log or a `Cause.pretty` shows is
   * the reason's own wording of what failed.
   *
   * @see {@link TrajectoryErrorReason} for the messages a trajectory has reasons for.
   * @category errors
   */
  override get message(): string {
    return this.reason.message;
  }

  /**
   * Creates the error for a response part `toolkit` cannot encode.
   *
   * @category constructors
   */
  static encodeTool = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ToolEncodeError({ toolkit, cause }) });

  /**
   * Creates the error for a response part `toolkit` cannot decode.
   *
   * @category constructors
   */
  static decodeTool = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ToolDecodeError({ toolkit, cause }) });

  /**
   * Creates the error for the session `id` failing for `reason`.
   *
   * @category constructors
   */
  static session = (id: string, reason: SessionErrorReason) =>
    new TrajectoryError({ reason: new SessionError({ id, reason }) });

  /**
   * Creates the error for a trajectory that failed with `cause`.
   *
   * @category constructors
   */
  static parse = (cause: unknown) => new TrajectoryError({ reason: new ParseError({ cause }) });
}
