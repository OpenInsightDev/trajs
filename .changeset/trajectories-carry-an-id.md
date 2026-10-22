---
"@trajs/core": minor
---

A trajectory is named by an id. `Trajectory` carries the id it is named by, and its
type states it first — `Trajectory<Id, Config, E, R>`, `Id` being `string` for a
trajectory made without a name of its own.

A trajectory made without an id is named by a new uuid; one made with an id is named
by that. Every place a trajectory is made states the id beside the config, before
what the trajectory is made of, so the terms of the trajectory come first:

- `Trajectory.make(id, config)(stream)` and `Trajectory.make(config)(stream)`.
- `Trajectory.merge(id)(left, right)` and `Trajectory.merge(left, right)`.
- `Produce.fromSession(id, config)(stream)`, `Produce.fromSessions(id, config)(sessions)`
  and `Produce.produce(id, config)(program)`, each without the id as well.

`Trajectory.make` no longer takes the stream first: `Trajectory.make(stream, config)`
is `stream.pipe(Trajectory.make(config))`, since the terms of a trajectory are bound
before what it is made of.
