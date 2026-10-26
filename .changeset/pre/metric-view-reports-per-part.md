---
"@trajs/core": minor
---

`View.metricTrajectory` reads its trajectory into `Cache.Cache` and hands every part the
reports that name it, keyed by metric tag, rather than a stream per part. A part's
`metrics` is now a `View.AttachedMetrics` record from a metric's tag to that metric's
reports of the part, in trajectory order, so one metric's reports are read as
`part.metrics[tag]` and their payloads narrow to that metric. A report may name a part
that appears after it, and a part is consumed once with all of its reports.

The function takes a `Trajectory` rather than a bare stream, because the cache reads it
by id, returns an `Effect` of the view rather than the view, and requires `Cache.Cache`.
Reading a trajectory now completes before the first part is emitted, so an infinite
trajectory never emits.

`Config.SchemaServices` states the requirement of an operation that both reads and
writes parts: the union of `DecodingServices` and `EncodingServices`, where it was their
intersection and dropped a side that was `never`. `Session.main` and
`View.metricTrajectory` require it.
