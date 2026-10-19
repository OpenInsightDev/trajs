---
"@trajs/utils": minor
---

Keep bytes in the key/value store of `effect/persistence`, cut into chunks as they
are written and read back at random: `ByteStore` serves what an id holds as a
`Bytes`, writes a sequence through a sink without holding it whole, and drops one
again. `ByteStore.layerKVStore` keeps a sequence in the key/value store a program
states, and `ByteStore.layer` keeps one in memory. Either states how a sequence is
cut, and reads back the size the sequence it reads was written with.
