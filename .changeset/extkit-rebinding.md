---
"@trajs/core": minor
---

Add `Extensionkit.extkits`, which binds a recorded trajectory to the extension
kits it is read with: every extension part is encoded with the trajectory's own
kit and decoded again with the merged one, so data recorded for an extension that
was unknown, or for an older version of it, regains the types of the extension's
newest version. Data no extension matches stays `Extensionkit.AnyPart`, the parts
of other kinds, the toolkit and the metadata are carried over, and a schema
failure is reported as a `TrajectoryError` carrying the kit it happened with.

`Extensionkit.Merged` now keeps the identifiers of every kit it is given rather
than only the ones they share, so `Extensionkit.merge` and `extkits` type the set
they produce by all of its identifiers.

`TrajectoryError`'s schema failures are renamed to say which collection they come
from: `EncodeError` and `DecodeError` are now `ToolEncodeError` and
`ToolDecodeError`, and `ExtensionEncodeError` and `ExtensionDecodeError` join them
for extension kits.
