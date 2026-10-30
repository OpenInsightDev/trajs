---
"@trajs/core": minor
---

An `Event`, `Metric`, or `Extra` declaration now throws a `TrajectoryError` at construction
when a schema it states has no layout for `SchemaBinary`, rather than failing where a part
is first written. `TrajectoryError.binaryLayout` wraps the new `BinaryLayoutError` reason.
