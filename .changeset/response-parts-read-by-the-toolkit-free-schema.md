---
"@trajs/core": minor
---

A response part naming a tool the reading toolkit does not name is read by the
toolkit-free schema of `effect/ai/Response`: `Trajectory.ResponsePart` reads a
response as `Schema.Union([AllParts(toolkit), AllParts()])` — the toolkit's own
reading first, so a tool it holds keeps the name, parameters and result its
schema states, and the toolkit-free one after it, so any other tool reads as
`AnyToolCallPart` or `AnyToolResultPart` rather than failing the read. The same
pair, `Part(toolkit)` with `Part()`, reads a response part that is whole.

`Response.AllPartsView`, `PartView`, `ToolCallPartsView` and
`ToolResultPartsView` are the types of those readings, now aliases alone: the
schemas this package wrote by hand for them are gone. So are
`Response.StreamPartView`, `Response.ToolPart`, `Response.ToolPartView`,
`Response.AnyToolPart`, the `isAnyToolCallPart` / `isAnyToolResultPart` /
`isAnyToolPart` guards, and the `AnyToolCallPart` / `AnyToolResultPart` schemas —
a decoded part no longer carries the private marker that told the two readings
apart. `Response.anyToolCallPart` and `Response.anyToolResultPart` still build a
part for a tool no toolkit describes.
