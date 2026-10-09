---
"@trajs/core": minor
---

Add `Trajectory.mapMetadata`, which updates the metadata of a trajectory by
applying a function to it. The function receives the trajectory's `Metadata` and
returns the metadata the new trajectory carries, so a field it does not carry
over is dropped rather than merged. The parts, the toolkit and the extension kit
are shared with the trajectory it was given, which is left unchanged, and the
update is available both directly and piped.
