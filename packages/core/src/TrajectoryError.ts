/**
 * Errors raised while converting trajectory parts between toolkits.
 *
 * Rebinding a trajectory encodes each part with the toolkit it was recorded
 * against and decodes it again with the merged toolkit. Either direction can
 * fail when a part does not match the schema it is checked against, so every
 * failure carries the toolkit that produced it.
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
 * Reasons a trajectory part could not be converted between toolkits.
 *
 * @category models
 */
export type TrajectoryErrorReason = EncodeError | DecodeError;

/**
 * Error raised when a trajectory part cannot be converted between toolkits.
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
}
