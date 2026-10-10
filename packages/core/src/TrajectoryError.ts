/**
 * Errors raised while reading, writing or converting trajectories.
 *
 * Rebinding a trajectory encodes each part with the kits it was recorded against
 * and decodes it again with the merged ones, and a recording is read from JSON
 * lines. Each of these steps can fail, so every {@link TrajectoryError} carries
 * what it was checking.
 */

import { Data, Schema } from "effect";
import type { Toolkit } from "effect/ai";
import type * as Extensionkit from "#/Extensionkit.ts";

/**
 * Failure to encode a trajectory part with a toolkit.
 *
 * @category errors
 */
export class ToolEncodeError extends Data.TaggedError("ToolEncodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {}

/**
 * Failure to decode a trajectory part with a toolkit.
 *
 * @category errors
 */
export class ToolDecodeError extends Data.TaggedError("ToolDecodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {}

/**
 * Failure to encode extension data with an extension kit.
 *
 * @category errors
 */
export class ExtensionEncodeError extends Data.TaggedError("ExtensionEncodeError")<{
  extkit: Extensionkit.Any;
  cause: Schema.SchemaError;
}> {}

/**
 * Failure to decode extension data with an extension kit.
 *
 * @category errors
 */
export class ExtensionDecodeError extends Data.TaggedError("ExtensionDecodeError")<{
  extkit: Extensionkit.Any;
  cause: Schema.SchemaError;
}> {}

/**
 * Failure to walk the sessions of a trajectory.
 *
 * @category errors
 */
export class SessionError extends Data.TaggedError("SessionError")<{
  session: string;
  reason: "cycle";
}> {}

/**
 * Failure to read a recorded trajectory.
 *
 * @category errors
 */
export class ParseError extends Data.TaggedError("ParseError")<{
  cause: unknown;
}> {}

/**
 * Reasons a trajectory could not be read, written or converted.
 *
 * @category models
 */
export type TrajectoryErrorReason =
  | ToolEncodeError
  | ToolDecodeError
  | ExtensionEncodeError
  | ExtensionDecodeError
  | SessionError
  | ParseError;

/**
 * Error raised while reading, writing or converting a trajectory.
 *
 * @category errors
 */
export class TrajectoryError extends Data.TaggedError("TrajectoryError")<{
  reason: TrajectoryErrorReason;
}> {
  /**
   * Wraps a schema encoding failure together with the toolkit it happened with.
   *
   * @category constructors
   */
  static encodeTool = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ToolEncodeError({ toolkit, cause }) });

  /**
   * Wraps a schema decoding failure together with the toolkit it happened with.
   *
   * @category constructors
   */
  static decodeTool = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ToolDecodeError({ toolkit, cause }) });

  /**
   * Wraps a schema encoding failure together with the extension kit it happened
   * with.
   *
   * @category constructors
   */
  static encodeExtension = (extkit: Extensionkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ExtensionEncodeError({ extkit, cause }) });

  /**
   * Wraps a schema decoding failure together with the extension kit it happened
   * with.
   *
   * @category constructors
   */
  static decodeExtension = (extkit: Extensionkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ExtensionDecodeError({ extkit, cause }) });

  /**
   * Wraps a failure to walk the sessions of a trajectory.
   *
   * @category constructors
   */
  static session = (session: string, reason: "cycle") =>
    new TrajectoryError({ reason: new SessionError({ session, reason }) });

  /**
   * Wraps a failure to read a recorded trajectory.
   *
   * @category constructors
   */
  static parse = (cause: unknown) => new TrajectoryError({ reason: new ParseError({ cause }) });
}
