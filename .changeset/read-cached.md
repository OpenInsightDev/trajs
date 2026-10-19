---
"@trajs/core": minor
---

`Loaded.readCached` reads a trajectory as `Loaded.read` reads it, except that the
bytes its parts are carried in are kept in a store rather than read from the
storage again: the frame read the first time is written under the hash and the
digest the trajectory states of its parts, so a reading after that — here, or in
any load of a trajectory whose bytes are the same — takes it from the store.

What keeps those bytes is the key/value store of `effect/persistence`
(`KeyValueStore`), which a trajectory read this way requires rather than the
exchange: a program that reads trajectories again provides the store it wants them
kept in, and one that reads each of them once keeps calling `Loaded.read`.
