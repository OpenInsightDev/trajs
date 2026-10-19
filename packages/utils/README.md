# @trajs/utils

The generic services a trajectory is carried and kept through, stated once so a
platform package can say what each is over.

- `Bytes` — a byte sequence read at random, and the sequence built from the reads
  a source serves.
- `Storage` — where a trajectory is kept, what a place that could not serve one
  failed with (`StorageError`), and the file storage this package ships.
- `ByteStore` — the bytes a program keeps between readings, held in chunks in the
  key/value store of `effect/persistence` (`ByteStore.layerKVStore`) or in memory
  (`ByteStore.layer`), read back as a `Bytes` and written a chunk at a time.
- `Compression` — what carries a trajectory's parts in a frame: zstd, gzip,
  deflate, or the bytes as they are, stated where the layer is built
  (`Compression.Options`) and written into the metadata a trajectory ends with.
- `StreamHash` — what reads the digest a trajectory is named by: BLAKE3, BLAKE2b
  or SHA-256, stated where the layer is built (`StreamHash.Options`) and written
  into the metadata a trajectory ends with, and the JavaScript hash this package
  ships for all three.

`@trajs/platform-node` and `@trajs/platform-browser` provide the layers these
services are read through, and [`@trajs/core`](../core)'s `Exchange.layer` is built
over them. A `ByteStore` is provided by a program instead — in memory with
`ByteStore.layer`, or in the key/value store it keeps its bytes in with
`ByteStore.layerKVStore` — and a trajectory read with its bytes kept requires one.
