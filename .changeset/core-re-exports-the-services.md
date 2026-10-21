---
"@trajs/core": minor
---

Read and write a trajectory with `@trajs/core` alone: the services a trajectory is
carried through — `Bytes`, `ByteStore`, `Compression`, `Storage` and `StreamHash` —
are re-exported from `@trajs/utils`, so a program states the file storage, the
compression and the hash it runs with as `Storage.layerFileSystem`,
`Compression.Options` and `StreamHash.Algorithm` from the core package, beside the
`Exchange` that reads and writes through them, and depends on no second package to
do it.
