# @trajs/platform-node

The implementations of [`@trajs/utils`](../utils)'s services that a program on
Node runs with.

- `NodeCompression` — a zstd, gzip, deflate or none frame carried by the streams
  `node:zlib` writes and reads.
- `NodeStreamHash` — the SHA-256, BLAKE2b-512 or XXH64 digest `node:crypto`
  and the binding `@node-rs/xxhash` compute.
- `NodeChecksum` — the CRC-32 of a block `zlib.crc32` reads.
- `NodeServices` — the compression, the hash and the checksum as one layer,
  provided beside the storage where a program on Node keeps a trajectory.
