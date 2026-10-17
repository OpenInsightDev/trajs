---
"@trajs/core": minor
"@trajs/platform-browser": minor
"@trajs/platform-bun": minor
"@trajs/platform-node": minor
"@trajs/react": minor
"@trajs/utils": minor
"@trajs/cli": minor
---

What these packages documented as "a recording" is a trajectory, and "record" is
no longer a term of its own: a run is _produced_ as a trajectory (`Produce`),
never "recorded". The exchange's format is the bytes
of a trajectory, its header and metadata are what the trajectory states of
itself, and a storage keeps, a compression carries and a hash names a trajectory.

The one public name that changes is `TrajectoryError.SessionError`'s reason
`"unrecorded-fork"`, now `"unproduced-fork"`.
