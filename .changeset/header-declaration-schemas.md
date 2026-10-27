---
"@trajs/core": minor
---

`Event.EventSchema`, `Event.EventKitSchema`, `Metric.MetricSchema`,
`Metric.MetricKitSchema`, `Extra.ExtraSchema`, and `Extra.ExtraKitSchema` state a
declaration as a trajectory's header stores it: its metadata, the package it is
in, and the JSON Schema documents of the schemas it declares. `Event.encode`,
`Metric.encode`, and `Extra.encode` build those records from a kit, as
`Toolkit.encode` already did.

`Toolkit.JsonSchemaDocument`, `Toolkit.ToolSchema`, and `Toolkit.ToolkitSchema`
are schemas as well as types, so a stored JSON Schema document is read as a
`JsonSchemaDocument` rather than as unknown JSON.

`Exchange.Header` states all four kits as those records. A header written by an
earlier version states no schema documents for its events, metrics, and extras,
so it no longer decodes.
