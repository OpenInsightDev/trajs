/**
 * The implementations of `@trajs/utils`'s services that a program on Bun runs with:
 * a zstd, gzip, deflate or none frame Bun writes and reads, the CRC-32 of a block
 * `Bun.hash.crc32` reads, and the SHA-256, BLAKE2b-512 or XXH64 digest
 * `Bun.CryptoHasher` and the binding `@node-rs/xxhash` compute.
 *
 * Every module is re-exported as a namespace — `BunCompression.layer` — and each is
 * also available as a subpath import such as
 * `@trajs/platform-bun/BunCompression`. `BunServices` aggregates them into
 * what the exchange layer of `@trajs/core` is provided with.
 *
 * The modules here import each other relatively rather than through the `imports`
 * field's `#/*`: Bun resolves that field's exact keys but not its wildcards, so a
 * program that runs on Bun could not load this package from source otherwise.
 */

export * as BunChecksum from "./BunChecksum.ts";

export * as BunCompression from "./BunCompression.ts";

export * as BunServices from "./BunServices.ts";

export * as BunStreamHash from "./BunStreamHash.ts";
