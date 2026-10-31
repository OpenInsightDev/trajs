---
"@trajs/utils": minor
---

`BinaryProtocol` now carries the names the Effect `Schema` module and
`SchemaBinary` state, rather than its own: `repeat` is `array`, `repeatOf` is
`arrayOf`, `branch` is `union`, `as` is `decodeTo`, and `message` is `toCodec`.
`toCodec` names the same derivation as `SchemaBinary.toCodec`: fields in, one
codec of a whole value's bytes out. Every layout still reads and writes the same
bytes as before.
