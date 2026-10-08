/**
 * Errors raised while reading, writing or converting trajectories.
 *
 * Rebinding a trajectory encodes each part with the toolkit it was recorded
 * against and decodes it again with the merged toolkit. Extension data is
 * decoded with the definition that describes it, and a recording is read from
 * JSON lines. Each of these steps can fail, so every failure carries what it was
 * checking.
 */

import { Data, Schema } from "effect";
import type { Toolkit } from "effect/ai";

/**
 * Failure to encode a trajectory part with a toolkit.
 *
 * @category errors
 */
export class EncodeError extends Data.TaggedError("EncodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {}

/**
 * Failure to decode a trajectory part with a toolkit.
 *
 * @category errors
 */
export class DecodeError extends Data.TaggedError("DecodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {}

/**
 * Failure to encode extension data with the definition that describes it.
 *
 * @category errors
 */
export class ExtensionEncodeError extends Data.TaggedError("ExtensionEncodeError")<{
  id: string;
  cause: Schema.SchemaError;
}> {}

/**
 * Failure to decode extension data with the definition that describes it.
 *
 * @category errors
 */
export class ExtensionDecodeError extends Data.TaggedError("ExtensionDecodeError")<{
  id: string;
  cause: Schema.SchemaError;
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
  | EncodeError
  | DecodeError
  | ExtensionEncodeError
  | ExtensionDecodeError
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
  static encode = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new EncodeError({ toolkit, cause }) });

  /**
   * Wraps a schema decoding failure together with the toolkit it happened with.
   *
   * @category constructors
   */
  static decode = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new DecodeError({ toolkit, cause }) });

  /**
   * Wraps a schema encoding failure together with the extension it happened
   * with.
   *
   * @category constructors
   */
  static encodeExtension = (id: string) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ExtensionEncodeError({ id, cause }) });

  /**
   * Wraps a schema decoding failure together with the extension it happened
   * with.
   *
   * @category constructors
   */
  static decodeExtension = (id: string) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new ExtensionDecodeError({ id, cause }) });

  /**
   * Wraps a failure to read a recorded trajectory.
   *
   * @category constructors
   */
  static parse = (cause: unknown) => new TrajectoryError({ reason: new ParseError({ cause }) });
}
