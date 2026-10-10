---
"@trajs/core": minor
---

`Extensionkit` now collects the extensions themselves, keyed by identifier, the
way a toolkit collects its tools: an entry is the `Extension`, not its line of
versions, so a set names the extension a datum came from and carries its
descriptive metadata. The generic parameter of `Extensionkit`, `Trajectory`,
`Trajectory.Part`, `Trajectory.PartStream` and the functions that take them is
the record of extensions rather than the kit type, so
`Exts extends Record<string, Extension.Any>` parallels
`Tools extends Record<string, Tool.Any>`; it is no longer defaulted to the
unknown set.

`Toolkit.toolkits` now preserves the trajectory's extension kit: it takes
`Trajectory<Tools, Exts, E, R>` and returns the merged tools with the same
`Exts`, instead of erasing the extensions to the unknown set. Like
`Extensionkit.extkits`, it rebuilds only the parts its own collection describes
and carries the parts of every other kind over unchanged.

`Toolkit.toolkits` and `Extensionkit.extkits` are no longer effectful: they take
a trajectory and return the bound one, so a recording is rebound with
`toolkits(weather)(recorded)` instead of
`yield* toolkits(weather)(recorded)`. A schema failure is still reported as a
`TrajectoryError`, from the returned trajectory's stream.

`TrajectoryError`'s schema failures are named after the collection they come
from: `TrajectoryError.encode` and `TrajectoryError.decode` are now
`TrajectoryError.encodeTool` and `TrajectoryError.decodeTool`, next to
`encodeExtension` and `decodeExtension`.
