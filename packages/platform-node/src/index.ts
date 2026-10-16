/**
 * The implementations of `@trajs/utils`'s services that a program on Node runs
 * with: its parts carried in a zstd, gzip, deflate or none frame `node:zlib` writes
 * and reads, and the BLAKE3, BLAKE2b or SHA-256 digest the Rust binding
 * `@napi-rs/blake-hash` and `node:crypto` read off them.
 *
 * Every module is re-exported as a namespace — `NodeCompression.layer`,
 * `NodeStreamHash.layer` — and each is also available as a subpath import such
 * as `@trajs/platform-node/NodeCompression`. `NodeServices` aggregates them into
 * the layer `@trajs/core`'s `Exchange.layer` is provided with.
 */

export * as NodeCompression from "#/NodeCompression.ts";

export * as NodeServices from "#/NodeServices.ts";

export * as NodeStreamHash from "#/NodeStreamHash.ts";
