---
"@trajs/core": minor
---

The metrics of a trajectory are produced by the kit of the run that writes it, so a
trajectory read later states only what that kit derived. `Produce.withMetrics` produces
the metrics of a kit over a trajectory that is already written, and answers with a
trajectory that holds the parts of the one given, in order and unchanged, followed by the
parts the metrics of the kit produce of them. It is dual, so the trajectory is stated
first — `Produce.withMetrics(trajectory, metrickit)` — or piped into the kit —
`trajectory.pipe(Produce.withMetrics(metrickit))`.

The metric parts follow the parts of the trajectory rather than interleaving with them,
because a metric part is read by the part it names: `Session` and `View` hold one by the
parts read before it, so one that came before its part would be read by nothing. The
trajectory is read twice — as its parts, and by the producers of the kit — over one
subscription, since a trajectory of a run is read once and is not asked again for what it
holds.

The trajectory answered with states a `MetricKit.Merged` kit of the one it was read with
and the one given, so the metrics it already holds and the ones added are read with the
one config, and a tag the kit given names again is read with the schema given. It is
named by a new id rather than by the id it was given, because a cache answers with what
it kept for an id, and these are not the parts that id was read for. A metric part the
trajectory already held is kept rather than replaced, so what is produced of a metric it
states again is held beside it.
