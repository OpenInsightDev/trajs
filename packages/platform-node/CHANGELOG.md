# @trajs/platform-node

## 0.0.0-alpha.5

### Minor Changes

- [`8537a14`](https://github.com/trajs-ai/trajs/commit/8537a14ad680e1a885de070aea5be2b5e90bd2b2) Thanks [@observerw](https://github.com/observerw)! - `Compression.make` takes a `Compression.Codec`: the frame of each algorithm its runtime writes
  and reads, and nothing of the options. The algorithm of a call, and the chunks `None` passes
  through untouched, are resolved in `@trajs/utils`, as `Checksum.make` takes a `Checksum.Codec`
  and reads the tables of that package where a runtime states no checksum.
  
  `Compression.Frame` names one direction of a frame, and `Compression.CodedAlgorithm` the
  algorithms a codec states: every algorithm except `None`, which no codec writes.
  
  `NodeCompression.layer`, `BunCompression.layer` and `BrowserCompression.layer` therefore
  state one codec per algorithm, and `NodeChecksum.layer` and `BunChecksum.layer` state the
  checksum of their runtime. `NodeCompression.compress`, `NodeCompression.decompress`,
  `NodeChecksum.of` and `BunChecksum.of` read the same frames and the same numbers as before.

- [`8537a14`](https://github.com/trajs-ai/trajs/commit/8537a14ad680e1a885de070aea5be2b5e90bd2b2) Thanks [@observerw](https://github.com/observerw)! - `StreamHash.Options` takes a `length`, the digest bytes a call reads. It is stated
  in either form, `StreamHash.digest` and `StreamHash.start`, and from 1 to the
  bytes of the algorithm: SHA-256 reads 32 bytes, BLAKE2b-512 64, and XXH64 8.
  
  A `length` below the bytes of the algorithm cuts the digest to its leading bytes,
  so a call that states `length: 8` of SHA-256 reads the first 8 bytes of the same
  digest, as 16 hex characters. A `length` beyond the algorithm raises a
  `RangeError` when the call is made, because no digest of that length exists.
  
  `StreamHash.make` builds the service from a `StreamHash.Codec`, which states the
  running digest of each algorithm and nothing of the options. The options and the
  digest bytes are resolved there, the digest is cut, and it is read as hex, so
  `NodeStreamHash.layer`, `BunStreamHash.layer` and `BrowserStreamHash.layer` state
  a running digest per algorithm only.
  
  A stored trajectory records the algorithm of its digest, not the `length` of the
  call that wrote it, so `Exchange.SaveOptions` digests the whole bytes of its
  algorithm.
  
  `BrowserStreamHash.layer` reads SHA-256 with `@noble/hashes` in both forms, where
  it read the stream form with WebCrypto. A page therefore needs no secure context
  to read a digest, and no stream is held whole to be digested.

### Patch Changes

- Updated dependencies [[`047e37d`](https://github.com/trajs-ai/trajs/commit/047e37d162f322a9a667fe013e558ca80d49f25e), [`c396840`](https://github.com/trajs-ai/trajs/commit/c396840173c01f77317b7f985a6c87fda93d5194), [`a566ead`](https://github.com/trajs-ai/trajs/commit/a566ead936a0f90e2f0aa4ab2e3975ab1d344191), [`8537a14`](https://github.com/trajs-ai/trajs/commit/8537a14ad680e1a885de070aea5be2b5e90bd2b2), [`8537a14`](https://github.com/trajs-ai/trajs/commit/8537a14ad680e1a885de070aea5be2b5e90bd2b2)]:
  - @trajs/utils@0.0.0-alpha.5

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
