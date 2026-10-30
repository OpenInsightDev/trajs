/**
 * The implementations of `@trajs/utils`'s services that a program computes
 * anywhere with: a zstd, gzip, deflate or none frame the browser's own codecs and
 * the WebAssembly zstd codec write and read, a SHA-256, BLAKE2b-512 or XXH64
 * digest `@noble/hashes` and the WebAssembly module of
 * `@node-rs/xxhash-wasm32-wasi` carry, and the bytes a program keeps between
 * readings, in a web storage of the page.
 *
 * Every module is re-exported as a namespace — `BrowserCompression.layer`,
 * `BrowserByteStore.layer` — and each is also available as a subpath import such
 * as `@trajs/platform-browser/BrowserCompression`. `BrowserServices` aggregates
 * the compression, the hash and the checksum into what the exchange layer of
 * `@trajs/core` is provided with.
 */

export * as BrowserByteStore from "#/BrowserByteStore.ts";

export * as BrowserCompression from "#/BrowserCompression.ts";

export * as BrowserServices from "#/BrowserServices.ts";

export * as BrowserStreamHash from "#/BrowserStreamHash.ts";
