---
"@trajs/utils": minor
---

Keep bytes in a temporary directory of the file system: `ByteStore.layerFsTemp`
makes a directory named after a prefix when the layer is built and removes it
when the scope it was built in closes, so bytes too many to hold in memory for
the life of a program are kept on disk and cleared with it. It is
`ByteStore.layerKVStore` over `KeyValueStore.layerFileSystem`, so it needs the
file system and the path service of the platform a program runs on.

A key/value store is no longer asked to remove a key it does not hold, which the
one over a file system fails on: writing a sequence to an id that held nothing,
and removing one that held nothing, no longer fail on it.
