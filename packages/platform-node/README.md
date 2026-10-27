# @trajs/platform-node

The implementations of [`@trajs/utils`](../utils)'s services that a program on
Node runs with.

- `NodeCompression` — a zstd, gzip, deflate or none frame carried by the streams
  `node:zlib` writes and reads.
- `NodeStreamHash` — the BLAKE3, BLAKE2b or SHA-256 digest the Rust binding
  `@napi-rs/blake-hash` and `node:crypto` compute.
- `NodeChecksum` — the CRC-32 of a block `zlib.crc32` reads.
- `NodeServices` — the compression, the hash and the checksum as one layer,
  provided beside the storage where a program on Node keeps a trajectory.
