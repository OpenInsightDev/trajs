/**
 * The implementations of `@trajs/utils`'s services that a program on Node runs
 * with: its parts carried in a frame `node:zlib` writes and reads, and the digest
 * read off them by the Rust binding `@napi-rs/blake-hash`.
 *
 * Every module is re-exported as a namespace — `NodeCompression.layer`,
 * `NodeStreamHash.layer` — and each is also available as a subpath import such
 * as `@trajs/platform-node/NodeCompression`. `NodeServices` aggregates them into
 * the layer `@trajs/core`'s `Exchange.layer` is provided with.
 */

export * as NodeCompression from "#/NodeCompression.ts";

export * as NodeServices from "#/NodeServices.ts";

export * as NodeStreamHash from "#/NodeStreamHash.ts";
