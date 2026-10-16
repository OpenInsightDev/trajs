# @trajs/utils

The generic services a recording is carried and kept through, stated once so a
platform package can say what each is over.

- `Bytes` — a byte sequence read at random, and the sequence built from the reads
  a source serves.
- `Storage` — where a recording is kept, what a place that could not serve one
  failed with (`StorageError`), and the file storage this package ships.
- `Compression` — what carries a recording's parts in a frame: zstd, gzip,
  deflate, or the bytes as they are, stated where the layer is built
  (`Compression.Options`) and written into the metadata a recording ends with.
- `StreamHash` — what reads the digest a recording is named by: BLAKE3, BLAKE2b
  or SHA-256, stated where the layer is built (`StreamHash.Options`) and written
  into the metadata a recording ends with, and the JavaScript hash this package
  ships for all three.

`@trajs/platform-node` and `@trajs/platform-browser` provide the layers these
services are read through, and
[`@trajs/core`](../core)'s `Exchange.layer` is built over them.
