---
"@trajs/core": minor
---

A kit's stored declarations now sit with the kit they describe, and `encode` describes one level
rather than both: `EventKit.EventKitSchema` and `EventKit.encode` take the kit-level form that stood
in `Event`, and `Event.encode` takes a single declaration. `MetricKit`, `ExtraKit`, and `Toolkit`
follow the same split, so `Tool.ToolkitSchema` gives way to `Toolkit.ToolkitSchema`, and
`Tool.encode` takes a single tool.

`SchemaDocument` is its own export rather than a member of `Toolkit`, because all four families
state their schemas as one.
