---
"@trajs/core": minor
---

Remove the extension API: the `Extension` and `Extensionkit` modules, the
`ExtensionPart` and `AnyExtensionPart` trajectory parts, the `extensions` field on
a trajectory and in the `.trajs` header, the extension errors, and the `extensions`
parameter of `Trajectory.Part` and `Trajectory.make`. `Persist.decode` and
`Persist.read` no longer take extension definitions, so `Persist.decode(records)`
and `Persist.read(key)` read a stream or a key directly.
