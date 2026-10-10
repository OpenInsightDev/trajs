---
"@trajs/core": minor
---

Add `Trajectory.empty`, which constructs a trajectory that holds no parts. It is
the trajectory `Trajectory.make` returns for an empty stream: it carries the
metadata it is given, defaulting to `Metadata` with no name and no description,
and holds no toolkit and no extension kit, so it is bound with
`Toolkit.toolkits` and `Extensionkit.extkits` like any other recording.
