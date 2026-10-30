# @trajs/platform-bun

The implementations of [`@trajs/utils`](../utils)'s services that a program on
Bun runs with.

- `BunCompression` — a zstd frame `Bun.zstdCompress` and `Bun.zstdDecompress`
  write and read, and a gzip or deflate frame `Bun.gzipSync`, `Bun.gunzipSync`,
  `Bun.deflateSync` and `Bun.inflateSync` do.
- `BunChecksum` — the CRC-32 of a block `Bun.hash.crc32` reads.
- `BunStreamHash` — the SHA-256 and BLAKE2b-512 digest `Bun.CryptoHasher`
  computes, and the XXH64 the binding
  [`@node-rs/xxhash`](https://npmjs.com/package/@node-rs/xxhash) computes.
- `BunServices` — the compression, the hash and the checksum as one layer,
  provided beside the storage where a program on Bun keeps a trajectory.

`Bun.hash.xxHash64` reads a whole input at once, so the XXH64 of a digest fed a
chunk at a time comes from the binding. Its modules import each
other relatively rather than through the `imports` field's `#/*`: Bun resolves
that field's exact keys but not its wildcards, so the package could not be loaded
from source otherwise.
