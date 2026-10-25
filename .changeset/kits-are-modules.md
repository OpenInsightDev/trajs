---
"@trajs/core": minor
"@trajs/extension-tokenize": minor
---

The kit an extension contributes — its events, its metrics, its extra data — is a
module of its own: `EventKit`, `ExtraKit` and `MetricKit` are to a trajectory what
`Toolkit` is, and are read and named the same way. `Event.ts`, `Extra.ts` and
`Metric.ts` keep what a kit collects — `Event.Event`, `Extra.Extra`,
`Metric.Metric`, and the part schemas each is read with — and no longer collect a
kit themselves.

What a kit is called follows `Toolkit`: `EventKit.make`, `EventKit.empty`,
`EventKit.merge`, `EventKit.Any`, `EventKit.Empty`, `EventKit.Merged` and the kit
type `EventKit.Kit<Events>`, and the same for `ExtraKit` and `MetricKit`, so
`makeKit` is `make`, `emptyKit` is `empty`, `mergeKit` is `merge`, `AnyKit` is
`Any`, `EmptyKit` is `Empty`, `Eventkit`/`Extrakit`/`Metrickit` are `Kit`, and
`EventsMerged`/`ExtrasMerged`/`MetrickitMerged` are `Merged` — which names the kit
the kits given make rather than the record inside it, so `merge` says it in one
name. A kit of metrics is provided with its producers in `MetricKit` too:
`MetricKit.toProducers`, `MetricKit.Producers` and `MetricKit.WithProducers`, which
`Metric.produce` runs.

`Trajectory.Config` states the three kits with the type parameters `Events`,
`Metrics` and `Extras`, which is what a config of any kit was already read as.
