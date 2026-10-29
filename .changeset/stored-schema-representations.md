---
"@trajs/core": minor
---

Stored schemas are `SchemaRepresentation` documents in their JSON form, where they were draft-07
JSON Schema documents. `Toolkit.encode`, `MetricKit.encode`, `ExtraKit.encode`, and `EventKit.encode`
state the encoded side of each schema, so `SchemaRepresentation.fromJson` reads a stored schema and
`SchemaRepresentation.fromRepresentation` rebuilds it. Rebuilding a schema that names a declaration
needs a reviver for that declaration.

`SchemaDocument` replaces `Toolkit.JsonSchemaDocument` and states the stored form.
`ToolSchema`, `MetricSchema`, `ExtraSchema`, and `EventSchema` hold it where they held a JSON
Schema document. `Tool.encode` reads the parameters of a dynamic tool from the JSON Schema that
tool states.

A trajectory that stores draft-07 documents no longer decodes with this release.
