/**
 * The implementations of `@trajs/utils`'s services that a program computes
 * anywhere with: a frame the WebAssembly zstd codec writes and reads, and a digest
 * the WebAssembly BLAKE3 `blake3-wasm` carries.
 *
 * Every module is re-exported as a namespace — `BrowserCompression.layer`,
 * `BrowserStreamHash.layer` — and each is also available as a subpath import such
 * as `@trajs/platform-browser/BrowserCompression`. `BrowserServices` aggregates
 * them into the one layer `@trajs/core`'s `Exchange.layer` is provided with.
 */

export * as BrowserCompression from "#/BrowserCompression.ts";

export * as BrowserServices from "#/BrowserServices.ts";

export * as BrowserStreamHash from "#/BrowserStreamHash.ts";
