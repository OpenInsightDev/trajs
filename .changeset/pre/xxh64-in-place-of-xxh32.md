---
"@trajs/core": minor
---

`StreamHash` reads one of three digests: `Algorithm.Sha256` (0), `Algorithm.Blake2b512` (1) and
`Algorithm.Xxh64` (2). `Algorithm.Xxh32` is removed, and `StreamHash.defaultAlgorithm` is
`Xxh64`, the cheapest of the three.

A digest of XXH64 is 8 bytes, so the metadata records 16 hex characters where it recorded 8. A
trajectory that records XXH32 no longer verifies, because the algorithm it recorded now states
XXH64.

`StreamHash.make` and `StreamHash.layer` are removed, since no codec of the package computes
XXH64. A platform package supplies all three: `@trajs/platform-node` and `@trajs/platform-bun`
read XXH64 with the binding `@node-rs/xxhash`, and `@trajs/platform-browser` reads it with the
WebAssembly module of `@node-rs/xxhash-wasm32-wasi` and BLAKE2b with `@noble/hashes`.
