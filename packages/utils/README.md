# @trajs/utils

The generic services a trajectory is carried and kept through, stated once so a
platform package can say what each is over.

- `Byte` — a byte sequence read at random, and the sequence built from the reads
  a source serves.
- `ByteStore` — the bytes a program keeps between readings, held in chunks in the
  key/value store of `effect/persistence` (`ByteStore.layerKVStore`), in memory
  (`ByteStore.layer`), in a temporary directory of the file system that goes with
  the scope (`ByteStore.layerFsTemp`), or in a bucket reached with a client of the
  AWS SDK (`ByteStore.layerS3`), read back as a `Byte` and written a chunk at a
  time.
- `Compression` — what carries a trajectory's parts in a frame: zstd, gzip,
  deflate, or the bytes as they are, stated at the call that writes or reads one
  (`Compression.Options`) and recorded with each chunk of a stored trajectory.
  What one chunk holds is one buffer, which `Compression.compressBytes` writes as
  one frame and `Compression.decompressBytes` reads back. The same frame carries
  the chunks of a stream (`Compression.compress`). A platform package states what
  its runtime writes and reads each algorithm with, through `Compression.make`:
  the options and the bytes passed through untouched are resolved here, so a
  platform states one codec per algorithm and nothing else.
- `Checksum` — what checks a block of a trajectory's parts: CRC-32, stated at
  the call that reads one (`Checksum.Options`) and read over one block at a time.
  A platform package states the checksum of its runtime through `Checksum.make`
  (`node:zlib`, `Bun.hash.crc32`), and the tables here read the same number where
  a runtime states none. A checksum catches a torn or misplaced block, and does
  not name it: what names a trajectory is a digest.
- `StreamHash` — what reads the digest of a trajectory's parts: SHA-256,
  BLAKE2b-512 or XXH64, stated at the call that reads one (`StreamHash.Options`)
  and recorded with a stored trajectory, read in one pass over a stream or fed to
  a running digest (`StreamHash.start`), which reads it as the digest bytes the
  call states. A platform package supplies the running digests of its runtime
  through `StreamHash.make`: the binding of
  [`@node-rs/xxhash`](https://npmjs.com/package/@node-rs/xxhash) on Node and Bun,
  and its WebAssembly module in a browser.

- `VersionedSchema` — payload schemas read at the version they state. `make`
  starts a version history from a struct with a literal `version`, `upgrade` adds
  a current schema and the migration from the previous one, and `TaggedUnion`
  groups those histories under a `_tag`.
- `Package` — `PackageMetadata`, the fields a `package.json` holds about the
  package itself, which an event, metric, or extra declaration states as its
  `packageMetadata`.

`@trajs/platform-node` and `@trajs/platform-browser` provide the layers these
services are read through, and the exchange layer of [`@trajs/core`](../core) is built
over them. A `ByteStore` is provided by a program instead — in memory with
`ByteStore.layer`, in the key/value store it keeps its bytes in with
`ByteStore.layerKVStore`, in a temporary directory with `ByteStore.layerFsTemp`, or
in a bucket with `ByteStore.layerS3` — and a trajectory read with its bytes kept
requires one.

Every module here is re-exported by [`@trajs/core`](../core): a program reads the
services a trajectory is carried through, and the schemas its declarations are
written over, from the core package rather than from this one.
