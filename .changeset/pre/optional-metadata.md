---
"@trajs/core": minor
---

A declaration no longer requires display information: `Event.Event` and
`Metric.Metric` state `metadata` as optional, and `Event.EventSchema`,
`Metric.MetricSchema`, and `Extra.ExtraSchema` accept an event, a metric, or an
extra that states none.

`Event.encode` and `Metric.encode` state no `metadata` for a declaration that
holds none. `Extra.encode` builds `metadata` from the name and the description an
extra declaration holds, and states none where it holds neither, where it used to
write an empty one.
