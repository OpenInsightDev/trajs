# @trajs/utils

The generic services a trajectory is carried and kept through, stated once so a
platform package can say what each is over.

- `Byte` — a byte sequence read at random, and the sequence built from the reads
  a source serves.
- `Storage` — where a trajectory is kept, what a place that could not serve one
  failed with (`StorageError`), and the storages this package ships: a directory of
  files (`Storage.layerFileSystem`) and a bucket reached with a client of the AWS
  SDK (`Storage.layerS3`). A write begins a trajectory or continues one from an
  offset (`Storage.WriteOptions.mode`), which a file holds and a bucket does not
  (`Storage.Capabilities`).
- `ByteStore` — the bytes a program keeps between readings, held in chunks in the
  key/value store of `effect/persistence` (`ByteStore.layerKVStore`), in memory
  (`ByteStore.layer`), or in a temporary directory of the file system that goes
  with the scope (`ByteStore.layerFsTemp`), read back as a `Byte` and written a
  chunk at a time.
- `Compression` — what carries a trajectory's parts in a frame: zstd, gzip,
  deflate, or the bytes as they are, stated at the call that writes or reads one
  (`Compression.Options`) and recorded with each chunk of a stored trajectory.
  What one chunk holds is one buffer, which `Compression.compressBytes` writes as
  one frame and `Compression.decompressBytes` reads back. The same codec carries
  the chunks of a stream (`Compression.compress`).
- `Checksum` — what checks a block of a trajectory's parts: CRC-32, stated at
  the call that reads one (`Checksum.Options`) and read over one block at a time.
  A platform package reads it with the codec of its runtime (`node:zlib`,
  `Bun.hash.crc32`), and the tables here read the same number where a runtime
  states none. A checksum catches a torn or misplaced block, and does not name
  it: what names a trajectory is a digest.
- `StreamHash` — what reads the digest of a trajectory's parts: SHA-256,
  BLAKE2b-512 or XXH64, stated at the call that reads one (`StreamHash.Options`)
  and recorded with a stored trajectory, read in one pass over a stream or fed to
  a running digest (`StreamHash.start`), which reads it as the bytes of its
  algorithm. A platform package supplies the codecs: the binding of
  [`@node-rs/xxhash`](https://npmjs.com/package/@node-rs/xxhash) on Node and Bun,
  and its WebAssembly module in a browser.

`@trajs/platform-node` and `@trajs/platform-browser` provide the layers these
services are read through, and the exchange layer of [`@trajs/core`](../core) is built
over them. A `ByteStore` is provided by a program instead — in memory with
`ByteStore.layer`, in the key/value store it keeps its bytes in with
`ByteStore.layerKVStore`, or in a temporary directory with `ByteStore.layerFsTemp`
— and a trajectory read with its bytes kept requires one.

Every module here is re-exported by [`@trajs/core`](../core): a program reads the
services a trajectory is carried through from the core package rather than from this
one.
