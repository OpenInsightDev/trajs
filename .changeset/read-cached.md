---
"@trajs/core": minor
---

`Loaded.readCached` reads a trajectory as `Loaded.read` reads it, except that the
bytes its parts are carried in are kept in a store rather than read from the
storage again: the frame read the first time is written under the hash and the
digest the trajectory states of its parts, so a reading after that — here, or in
any load of a trajectory whose bytes are the same — takes it from the store.

What keeps those bytes is a store of byte sequences (`@trajs/utils`'s `ByteStore`), which
a trajectory read this way requires rather than the exchange: a program provides a store
where it reads trajectories again — `ByteStore.layer` keeps them in memory for as long as
the program runs, and `ByteStore.layerKVStore` in the key/value store it states — and one
that reads each of them once keeps calling `Loaded.read`. The frame is kept in that store
as it is read rather than held whole, so a trajectory too large to hold is read this way
all the same.
