---
"@trajs/core": minor
---

`Event.make`, `Metric.make`, and `Extra.make` build a declaration from the
fields it states, and `Event.makeUnknown`, `Metric.makeUnknown`, and
`Extra.makeUnknown` build one from its package name and id alone. The payload,
result, and part schemas of an unknown declaration accept any data, so a kit
can name data whose schemas the caller does not hold.

`Event.Event`, `Metric.Metric`, and `Extra.Extra` therefore accept any schema,
where they used to require a versioned one, and their `Any` types widen to
`Schema.Top`. Schemas built with `VersionedSchema.make` still read historical
payloads and keep their current schema in `self`.
