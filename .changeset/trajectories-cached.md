---
"@trajs/core": minor
---

`Trajectory.cache` reads a trajectory as one that reads again: its parts are ke
pt as it is
read once, so every reader reads it from its first part, whatever moment it star
ts at. A
reader that subscribes after the trajectory ended reads it whole, which is where
this differs
from `Stream.share`, whose later subscribers read only the parts replayed to the
m.

What it keeps is a window of the newest parts in memory and, beyond it, the part
s as the
frames a trajectory is carried in — written into the store of byte sequences a p
rogram
provides (`@trajs/utils`'s `ByteStore`, so memory, a file system or a database a
s that store
states) under keys of the cache's own, and read back as a reader asks for them —
so a
trajectory longer than the window is held by that store rather than in memory.
`Trajectory.cache(trajectory, { capacity })` states the window, and defaults to
holding every
part; stated alone it comes before the trajectory, as the terms of a trajectory
do:
`Trajectory.cache({ capacity })(trajectory)`.

Everything that reads one trajectory more than once is a reading of a cached one:

- `Session.toSessions` caches the trajectory in memory and reads its sessions out of what the
  cache kept, so what it gives fails with the trajectory's own failure as well: a session of a
  trajectory that failed to read fails where it is read.
- `Session.toSessionsCached` reads them out of a cache of the trajectory kept in the store a
  program provides, and is given the `Trajectory.CacheOptions` that cache is read with, as
  `Trajectory.cache` is: `capacity` states the newest parts held in memory and defaults to every
  one of them, so a program that keeps nothing of them in memory states `{ capacity: 0 }`. It is
  what that reading now requires a scope for: the store holds the parts for as long as the
  sessions read of them are, and what the cache wrote is removed with the scope.
- `Exchange` reads a trajectory once — `Loaded.read` — and a program that reads a loaded one
  again caches it, so a load requires no store of bytes any longer.
