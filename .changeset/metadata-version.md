---
"@trajs/core": minor
---

Move the specification version into the trajectory metadata. `Metadata` loses its
`id` (a trajectory identity the model never gave uniqueness or resolution
semantics) and gains a required `version`: the version of `@trajs/core` that wrote
the recording, read from the package manifest as the new `Trajectory.version`
constant and defaulted to it when a trajectory is constructed. A `.trajs` header
no longer carries a `version` field of its own, and its `metadata` is required, so
`Persist` refuses to decode a recording that does not state the version it was
written against.
