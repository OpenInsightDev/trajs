---
"@trajs/core": minor
---

`Trajectory.make` makes a trajectory of the parts a stream gives, carrying what
they are read with: it is the trajectory a program assembled rather than decoded,
so what reads it is given neither the parts nor the kits beside it. It is stated
in both call styles, as the `dual` APIs of `effect` are — `Trajectory.make(stream,
config)` given the two at once, and `stream.pipe(Trajectory.make(config))` with the
config bound first — so the parts a stream gives are judged against the config
given.

What a trajectory was assembled from used to be stated by the caller —
`Object.assign(parts, config)` — so every place that made one had to know that a
trajectory is a stream with a config stated on it. `Produce`, the reading an
exchange gives and `Trajectory.merge` now make their trajectories with
`Trajectory.make`, and so do the examples, the tests and the doc examples of the
extensions.
