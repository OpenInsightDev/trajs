---
"@trajs/platform-browser": minor
"@trajs/platform-bun": minor
"@trajs/platform-node": minor
"@trajs/utils": minor
---

`Compression.compressBytes` and `Compression.decompressBytes` write and read one
frame over the bytes of one region, which is what a writer that assembles a
chunk of the stored container holds. `Compression.make` builds the service over
a platform's stream codec and derives both from it, so every layer of a platform
package answers the buffer form.

`StreamHash.Hashing.digest` reads the digest as its 32 bytes rather than as 64
hex characters, which is what a chunk is chained with. A running digest of the
BLAKE3 of `@napi-rs/blake-hash` and of `blake3-wasm` reads it the same way, and
`StreamHash.digest` still states the digest as hex, so a recorded digest is
written as it was.
