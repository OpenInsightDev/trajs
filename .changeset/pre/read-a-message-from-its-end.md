---
"@trajs/utils": minor
---

`BinaryProtocol.Options` takes a `direction`, the end a message's fields are read
from, defaulting to `"forward"`. A `"backward"` message reads its fields from the
last byte, so a field states its length, its count, or its branch by a field
declared after it. `BinaryProtocol.bytesOf` therefore sizes a region by a length
kept at the tail, such as the trailer of a block.

Writing is unchanged, because a field spans the bytes it states in either
direction: a `"backward"` message is still written in the order its fields are
declared. `BinaryProtocol.frame` states its length before its bytes, so a message
read backwards holds no frame.
