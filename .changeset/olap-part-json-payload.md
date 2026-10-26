---
"@trajs/olap": minor
---

`Parts.rows` states a part as its canonical JSON form rather than as the exchange
encodes it, so a `Uint8Array` in a payload is the base64 string JSON states it
as rather than an object of a key per byte, and a `bigint` is its decimal string.
An image of 1024 bytes used to write 1024 paths into the `part` `JSON` column and
now writes one.

`Parts.Encoded` is `Schema.JsonObject` and no longer takes the config, since
canonical JSON does not depend on the kits. A value of the part's schema that is
`unknown`, such as a param of a tool no toolkit declares, must already be JSON: a
part carrying one that is not fails to encode instead of writing a payload the
`JSON` column cannot hold.
