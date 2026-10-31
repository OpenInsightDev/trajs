---
"@trajs/core": minor
---

`SchemaDocument` is removed. A stored schema is `Schema.Json` in every declaration that holds one.
The stored form of a schema is a `SchemaRepresentation.Document` in its JSON form, which
`Schema.Json` states without an export of its own.

`ToolSchema`, `MetricSchema`, `ExtraSchema`, and `EventSchema` hold `Schema.Json` where they
held `SchemaDocument`, so the stored shape of a trajectory does not change.
