/**
 * The implementations of `@trajs/utils`'s services that a program on Node runs
 * with: its parts carried in a zstd, gzip, deflate or none frame `node:zlib` writes
 * and reads, the SHA-256, BLAKE2b-512 or XXH64 digest `node:crypto` and
 * `@node-rs/xxhash` read off them, and the CRC-32 of a block
 * `zlib.crc32` reads.
 *
 * Every module is re-exported as a namespace — `NodeCompression.layer`,
 * `NodeStreamHash.layer` — and each is also available as a subpath import such
 * as `@trajs/platform-node/NodeCompression`. `NodeServices` aggregates them into
 * what the exchange layer of `@trajs/core` is provided with.
 */

export * as NodeChecksum from "#/NodeChecksum.ts";

export * as NodeCompression from "#/NodeCompression.ts";

export * as NodeServices from "#/NodeServices.ts";

export * as NodeStreamHash from "#/NodeStreamHash.ts";
