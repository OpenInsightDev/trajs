import { Data, Schema } from "effect";
import type { Toolkit } from "effect/ai";

export class EncodeError extends Data.TaggedError("EncodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {}

export class DecodeError extends Data.TaggedError("DecodeError")<{
  toolkit: Toolkit.Any;
  cause: Schema.SchemaError;
}> {}

export type TrajectoryErrorReason = EncodeError | DecodeError;

export class TrajectoryError extends Data.TaggedError("TrajectoryError")<{
  reason: TrajectoryErrorReason;
}> {
  static encode = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new EncodeError({ toolkit, cause }) });

  static decode = (toolkit: Toolkit.Any) => (cause: Schema.SchemaError) =>
    new TrajectoryError({ reason: new DecodeError({ toolkit, cause }) });
}
