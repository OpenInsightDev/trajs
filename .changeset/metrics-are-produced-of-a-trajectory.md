---
"@trajs/core": minor
---

The metrics of a trajectory are produced by the kit of the run that writes it, so a
trajectory read later states only what that kit derived. `Produce.produceMetrics`
produces the metrics of a kit over a trajectory that is already written, and answers
with a trajectory that holds the parts of the one given, in order and unchanged, with
the parts the metrics of the kit produce of them merged in. It is dual, so the
trajectory is stated first — `Produce.produceMetrics(trajectory, metrickit)` — or piped
into the kit — `trajectory.pipe(Produce.produceMetrics(metrickit))`.

The metric parts are produced while the trajectory is read, and each is merged in as it
is produced: a producer has read the parts a metric part names before producing it, so
`Session` and `View` hold what it states. The trajectory is read twice — as its parts,
and by the producers of the kit — over one subscription, since a trajectory of a run is
read once and is not asked again for what it holds. A run that is produced rather than
read again (`Produce.produce`, `Produce.fromSession`) merges the metric parts it derives
the same way.

The trajectory answered with states a `MetricKit.Merged` kit of the one it was read with
and the one given, so the metrics it already holds and the ones added are read with the
one config, and a tag the kit given names again is read with the schema given. It is
named by a new id rather than by the id it was given, because a cache answers with what
it kept for an id, and these are not the parts that id was read for. A metric part the
trajectory already held is kept rather than replaced, so what is produced of a metric it
states again is held beside it.
