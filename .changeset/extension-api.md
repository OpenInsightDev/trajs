---
"@trajs/core": minor
---

Add the extension API: an extension is an identifier, descriptive metadata and a
line of versions of its data. `Extension.make` declares the oldest version,
`Extension.upgrade` derives the next one, and `Extensionkit` collects extensions
into the identifier to schema map a recording is read with. A trajectory carries
that map as its `extkit` field, typed the way `toolkit` is, and
`Trajectory.ExtensionPart` reads the data of each extension through the
extension's own line of versions, so data recorded against an older version is
read as the newest one.

`Trajectory.make` and `Trajectory.Part` take the kit, so they are called as
`Trajectory.make(parts, toolkit, extkit, metadata?)` and `Part(toolkit, extkit)`.
`Persist.encode` writes extension parts with the trajectory's own kit.

`Trajectory.Uuid` and `Trajectory.Timestamp` are no longer exported, and
`Versions.upTo` is gone: a version reads its whole line and encodes its own
value, so no separate reader has to be asked for.

Data recorded for an extension the kit does not hold, or whose shape no version
of its line accepts, is carried as `Extensionkit.AnyPart` instead of failing the
recording: `Extensionkit.PartView` reads both kinds, and
`Extensionkit.isAnyPart` tells them apart.
