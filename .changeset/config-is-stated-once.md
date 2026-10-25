---
"@trajs/core": minor
---

What a trajectory is read with is stated once, by `Trajectory.config`: a config built of the
kits its parts are read with and the variant they are in, which is what `Trajectory.make`,
the `read` of a load and the part schemas of `Part` take. A config is no longer written
out at each place one is needed, as a record of kits whose `stream` had to be given `as
const` to keep the variant it states: `stream` is read as the literal it is written as, so
`Trajectory.config({ stream: false, … }).stream` is `false`.

`Produce.fromSession`, `Produce.fromSessions` and `Produce.produce` are given that config
rather than a record of kits beside it, so what a program produces is read with the very
config it was produced with. What they are given is a `Produce.ProducingConfig` — a config
whose metric kit states the producer of each of its metrics (`MetricKit.WithProducers`) —
and that kit is what the trajectory they return states, so what a kit derives of a
trajectory is read off the trajectory rather than declared beside it. `stream` states
nothing of what is produced: the parts a program produces are the increments an answer
arrives in, so a produced trajectory is read with streams whatever the config given states.
