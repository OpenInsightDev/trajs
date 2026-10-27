# @trajs/platform-browser

The implementations of [`@trajs/utils`](../utils)'s services that a program
computing anywhere with WebAssembly runs with.

- `BrowserCompression` — a gzip or deflate frame the browser's own
  `CompressionStream` writes and `DecompressionStream` reads, and a zstd frame
  carried by the WebAssembly codec
  [`@structured-world/structured-zstd`](https://npmjs.com/package/@structured-world/structured-zstd).
- `BrowserStreamHash` — the BLAKE3 digest the WebAssembly `blake3-wasm` carries,
  the SHA-256 WebCrypto reads, and the BLAKE2b the JavaScript hash of
  [`@trajs/utils`](../utils) computes.
- `BrowserServices` — the three as one layer, provided with where a page keeps a
  trajectory: the compression and the hash of this package, and the CRC-32 of
  [`@trajs/utils`](../utils), since a page states no CRC of its own.
