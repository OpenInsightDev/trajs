---
"@trajs/core": minor
---

`Trajectory.share` reads a trajectory as one that reads again: its parts are kept as it is
read once, so every reader reads it from its first part, whatever moment it starts at. A
reader that subscribes after the trajectory ended reads it whole, which is where this differs
from `Stream.share`, whose later subscribers read only the parts replayed to them.

What it keeps is a window of the newest parts in memory and, beyond it, the parts as the
frames a trajectory is carried in — written into the store of byte sequences a program
provides (`@trajs/utils`'s `ByteStore`, so memory, a file system or a database as that store
states) under keys of the share's own, and read back as a reader asks for them — so a
trajectory longer than the window is held by that store rather than in memory.
`Trajectory.share(trajectory, { capacity })` states the window, and defaults to holding every
part; stated alone it comes before the trajectory, as the terms of a trajectory do:
`Trajectory.share({ capacity })(trajectory)`.
