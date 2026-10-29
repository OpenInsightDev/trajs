# @trajs/platform-node

## 0.0.0-alpha.4

### Minor Changes

- [`db80c27`](https://github.com/trajs-ai/trajs/commit/db80c278550c477ea2491db89f67eb95829d971b) Thanks [@observerw](https://github.com/observerw)! - `Compression.compressBytes` and `Compression.decompressBytes` write and read one
  frame over the bytes of one region, which is what a writer that assembles a
  chunk of the stored container holds. `Compression.make` builds the service over
  a platform's stream codec and derives both from it, so every layer of a platform
  package answers the buffer form.
  
  `StreamHash.Hashing.digest` reads the digest as its 32 bytes rather than as 64
  hex characters, which is what a chunk is chained with. A running digest of the
  BLAKE3 of `@napi-rs/blake-hash` and of `blake3-wasm` reads it the same way, and
  `StreamHash.digest` still states the digest as hex, so a recorded digest is
  written as it was.

- [`6176cea`](https://github.com/trajs-ai/trajs/commit/6176cea7cf4130fcf85f75592e912d699bc22f19) Thanks [@observerw](https://github.com/observerw)! - `StreamHash` reads one of three digests: `Algorithm.Sha256` (0), `Algorithm.Blake2b512`
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

### Patch Changes

- Updated dependencies [[`db80c27`](https://github.com/trajs-ai/trajs/commit/db80c278550c477ea2491db89f67eb95829d971b), [`6176cea`](https://github.com/trajs-ai/trajs/commit/6176cea7cf4130fcf85f75592e912d699bc22f19)]:
  - @trajs/utils@0.0.0-alpha.4

## 0.0.0-alpha.3

### Minor Changes

- [`8de6038`](https://github.com/trajs-ai/trajs/commit/8de60386eccdf99d6f78e5f1a4a050ea79213eba) Thanks [@observerw](https://github.com/observerw)! - A compression and a hash no longer state the algorithm they carry or digest with.
  `Compression.algorithm` and `StreamHash.algorithm` are removed. `Compression.compress`,
  `Compression.decompress` and `StreamHash.digest` take the algorithm as the option of
  the call (`Compression.Options`, `StreamHash.Options`). One service writes, reads and
  digests with every algorithm its platform states.
  `NodeCompression.layer`, `BunCompression.layer`, `BrowserCompression.layer`,
  `NodeStreamHash.layer`, `BrowserStreamHash.layer`, `StreamHash.layer` and
  `StreamHash.make` take no algorithm. `Options` is removed from `NodeServices`,
  `BunServices` and `BrowserServices`, and their `layer` is a constant layer.
  
  `Exchange.save` takes an `Exchange.SaveOptions`, the options of the compression and
  of the hash used for the write. It records both algorithms in the metadata it writes.
  `Exchange.load` reads a frame back in the algorithm of the metadata, not the
  algorithm of the compression. A trajectory written in gzip, deflate or no frame at
  all loads through a compression provided with no option.

### Patch Changes

- Updated dependencies [[`8de6038`](https://github.com/trajs-ai/trajs/commit/8de60386eccdf99d6f78e5f1a4a050ea79213eba)]:
  - @trajs/utils@0.0.0-alpha.3

## 0.0.0-alpha.2

### Patch Changes

- Updated dependencies []:
  - @trajs/utils@0.0.0-alpha.2

## 0.0.0-alpha.1

### Patch Changes

- [`eb0faec`](https://github.com/trajs-ai/trajs/commit/eb0faec9944c344eabe9e32f19a7507b821e53ad) Thanks [@observerw](https://github.com/observerw)! - Release the core libraries under `packages/` as `0.0.0-alpha.1`. They are one
  Changesets `fixed` group and share that version: `@trajs/core`, `@trajs/olap`,
  `@trajs/platform-browser`, `@trajs/platform-bun`, `@trajs/platform-node` and
  `@trajs/utils`.
- Updated dependencies [[`eb0faec`](https://github.com/trajs-ai/trajs/commit/eb0faec9944c344eabe9e32f19a7507b821e53ad)]:
  - @trajs/utils@0.0.0-alpha.1
