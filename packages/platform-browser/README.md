# @trajs/platform-browser

The implementations of [`@trajs/utils`](../utils)'s services that a program
computing anywhere with WebAssembly runs with.

- `BrowserCompression` — a gzip or deflate frame the browser's own
  `CompressionStream` writes and `DecompressionStream` reads, and a zstd frame
  carried by the WebAssembly codec
  [`@structured-world/structured-zstd`](https://npmjs.com/package/@structured-world/structured-zstd).
- `BrowserByteStore` — the bytes a page keeps between readings, the chunks of a
  sequence in the `sessionStorage` of the tab, kept under a prefix so the page
  shares none of them.
- `BrowserStreamHash` — the SHA-256 digest WebCrypto reads, and the BLAKE2b-512
  and XXH32 the JavaScript hash of [`@trajs/utils`](../utils) computes.
- `BrowserServices` — the codecs as one layer, provided with where a page keeps a
  trajectory: the compression and the hash of this package, and the CRC-32 of
  [`@trajs/utils`](../utils), since a page states no CRC of its own.
