# @trajs/platform-node

The implementations of [`@trajs/utils`](../utils)'s services that a program on
Node runs with.

- `NodeCompression` — a frame carried by the zstd stream `node:zlib` writes and
  reads one with.
- `NodeStreamHash` — the BLAKE3 digest the Rust binding `@napi-rs/blake-hash`
  computes.
- `NodeServices` — the two as one layer, provided beside the storage where a
  program on Node keeps a recording ([`@trajs/core`](../core)'s `Exchange.layer`
  takes all three).
