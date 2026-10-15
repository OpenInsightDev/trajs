# @trajs/platform-browser

The implementations of [`@trajs/utils`](../utils)'s services that a program
computing anywhere with WebAssembly runs with.

- `BrowserCompression` — a frame carried by the WebAssembly zstd codec
  [`@structured-world/structured-zstd`](https://npmjs.com/package/@structured-world/structured-zstd).
- `BrowserStreamHash` — the BLAKE3 digest the WebAssembly `blake3-wasm` carries.
- `BrowserServices` — the two as one layer, provided with where a page keeps a
  recording.
