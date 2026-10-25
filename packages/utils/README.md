# @trajs/utils

The generic services a trajectory is carried and kept through, stated once so a
platform package can say what each is over.

- `Byte` — a byte sequence read at random, and the sequence built from the reads
  a source serves.
- `Storage` — where a trajectory is kept, what a place that could not serve one
  failed with (`StorageError`), and the storages this package ships: a directory of
  files (`Storage.layerFileSystem`) and a bucket reached with a client of the AWS
  SDK (`Storage.layerS3`).
- `ByteStore` — the bytes a program keeps between readings, held in chunks in the
  key/value store of `effect/persistence` (`ByteStore.layerKVStore`), in memory
  (`ByteStore.layer`), or in a temporary directory of the file system that goes
  with the scope (`ByteStore.layerFsTemp`), read back as a `Byte` and written a
  chunk at a time.
- `Compression` — what carries a trajectory's parts in a frame: zstd, gzip,
  deflate, or the bytes as they are, stated where the layer is built
  (`Compression.Options`) and written into the metadata a trajectory ends with.
- `StreamHash` — what reads the digest of a trajectory's parts: BLAKE3, BLAKE2b
  or SHA-256, stated where the layer is built (`StreamHash.Options`) and written
  into the metadata a trajectory ends with, and the JavaScript hash this package
  ships for all three.

`@trajs/platform-node` and `@trajs/platform-browser` provide the layers these
services are read through, and the exchange layer of [`@trajs/core`](../core) is built
over them. A `ByteStore` is provided by a program instead — in memory with
`ByteStore.layer`, in the key/value store it keeps its bytes in with
`ByteStore.layerKVStore`, or in a temporary directory with `ByteStore.layerFsTemp`
— and a trajectory read with its bytes kept requires one.

Every module here is re-exported by [`@trajs/core`](../core): a program reads the
services a trajectory is carried through from the core package rather than from this
one.
