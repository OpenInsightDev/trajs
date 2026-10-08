import { Schema } from "effect";

export class TrajectoryError extends Schema.TaggedError<TrajectoryError>(
  "open-insight/trajectory/TrajectoryError",
)("TrajectoryError", {}) {}
