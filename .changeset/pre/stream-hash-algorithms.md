---
"@trajs/platform-browser": minor
"@trajs/platform-bun": minor
"@trajs/platform-node": minor
"@trajs/utils": minor
---

`StreamHash` reads one of three digests: `Algorithm.Sha256` (0), `Algorithm.Blake2b512`
(1) and `Algorithm.Xxh32` (2). `Algorithm.Blake3` and the 32-byte `Algorithm.Blake2b`
are removed, and `StreamHash.defaultAlgorithm` is `Xxh32`, the cheapest of the three.

A digest now has the bytes of its algorithm rather than 32 bytes for every one, so
the metadata records 64 hex characters for SHA-256, 128 for BLAKE2b and 8 for XXH32.
A trajectory that records BLAKE3 or the 32-byte BLAKE2b no longer decodes.

`@trajs/platform-node` reads SHA-256 and BLAKE2b-512 with `node:crypto`, and XXH32
with the binding `@node-rs/xxhash` in place of `@napi-rs/blake-hash`.
`@trajs/platform-bun` reads SHA-256 and BLAKE2b-512 with `Bun.CryptoHasher`, and
XXH32 with the JavaScript hash of `@trajs/utils`, so it no longer depends on
`@trajs/platform-node`.
`@trajs/platform-browser` reads BLAKE2b-512 and XXH32 with the JavaScript hash of
`@trajs/utils`, so it no longer depends on `blake3-wasm`.
