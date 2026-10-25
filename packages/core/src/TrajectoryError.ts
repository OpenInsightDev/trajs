/**
 * Failures from trajectory schemas, sessions, and stored representations.
 *
 * {@link TrajectoryError} wraps a specific reason and exposes it as `cause`.
 * Static constructors preserve the operation's failure context.
 *
 * @stability stable
 */

import { Data, Formatter, Schema } from "effect";
import type { Toolkit } from "effect/ai";

const listed = (members: ReadonlyArray<string>): string =>
  members.length > 0 ? members.join(", ") : "none";

/**
 * A response encoding failure retaining its toolkit and schema error.
 *
 * @see {@link ToolDecodeError} for the inverse operation.
 * @see {@link TrajectoryError.encodeTool} for wrapping the reason.
 * @stability stable
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
 * A response decoding failure retaining its toolkit and schema error.
 *
 * @see {@link ToolEncodeError} for the inverse operation.
 * @see {@link TrajectoryError.decodeTool} for wrapping the reason.
 * @stability stable
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
 * The session invariants checked during production and session discovery.
 *
 * **Details**
 *
 * - `unproduced-fork` identifies a missing, late, or unsupported fork target.
 * - `late-declaration` identifies a declaration after session use or a duplicate id during production.
 * - `undeclared-session` identifies parts naming a non-main session without a declaration.
 *
 * @see {@link SessionError} for the affected session id.
 * @stability stable
 * @category models
 */
export type SessionErrorReason = "unproduced-fork" | "late-declaration" | "undeclared-session";

const sessionFailure: Record<SessionErrorReason, string> = {
  "unproduced-fork":
    "it continues from a part the trajectory does not hold, or one no session continues from",
  "late-declaration": "it was declared after the parts it produced",
  "undeclared-session": "it is named by a part, and no session part declares it",
};

/**
 * An invalid session declaration or fork, identified by session id.
 *
 * @see {@link SessionErrorReason} for individual invariants.
 * @see {@link TrajectoryError.session} for wrapping the reason.
 * @stability stable
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
 * A trajectory parsing or serialization failure retaining the original cause.
 *
 * @see {@link TrajectoryError.parse} for wrapping the reason.
 * @stability stable
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
 * The specific failure wrapped by a {@link TrajectoryError}.
 *
 * @see {@link ToolEncodeError} for response encoding failures.
 * @see {@link ToolDecodeError} for response decoding failures.
 * @see {@link SessionError} for invalid sessions.
 * @see {@link ParseError} for parsing and serialization failures.
 * @stability stable
 * @category errors
 */
export type TrajectoryErrorReason = ToolEncodeError | ToolDecodeError | SessionError | ParseError;

/**
 * A trajectory failure carrying a structured reason.
 *
 * **Details**
 *
 * `cause` is the same value as `reason`.
 * The message comes from that reason.
 *
 * @see {@link TrajectoryErrorReason} for the supported failure cases.
 * @stability stable
 * @category errors
 */
export class TrajectoryError extends Data.TaggedError("TrajectoryError")<{
  reason: TrajectoryErrorReason;
}> {
  override readonly cause = this.reason;

  override get message(): string {
    return this.reason.message;
  }

  /**
   * Wraps a schema encoding error with its toolkit.
   *
   * @see {@link ToolEncodeError} for the retained reason.
   */
  static encodeTool = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ToolEncodeError({ toolkit, cause }) });

  /**
   * Wraps a schema decoding error with its toolkit.
   *
   * @see {@link ToolDecodeError} for the retained reason.
   */
  static decodeTool = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ToolDecodeError({ toolkit, cause }) });

  /**
   * Wraps a session invariant failure with its session id.
   *
   * @see {@link SessionError} for the retained reason.
   */
  static session = (id: string, reason: SessionErrorReason) =>
    new TrajectoryError({ reason: new SessionError({ id, reason }) });

  /**
   * Wraps a parsing or serialization failure without discarding its cause.
   *
   * @see {@link ParseError} for the retained reason.
   */
  static parse = (cause: unknown) => new TrajectoryError({ reason: new ParseError({ cause }) });
}
