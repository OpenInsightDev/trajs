---
"@trajs/core": minor
---

`Toolkit.ToolEncoded` and `Toolkit.ToolkitEncoded` are `Toolkit.ToolSchema` and
`Toolkit.ToolkitSchema`. Both state draft-07 JSON Schema documents, so the name
follows the shape rather than `Toolkit.encode` producing it.

`Toolkit.encode` still builds a `ToolkitSchema` from a toolkit.
