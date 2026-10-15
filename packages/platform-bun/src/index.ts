/**
 * The implementations of `@trajs/utils`'s services that a program on Bun runs with:
 * a frame `Bun.zstdCompress` writes and reads, and the digest `@trajs/platform-node`
 * reads through the Rust binding `@napi-rs/blake-hash`.
 *
 * Every module is re-exported as a namespace — `BunCompression.layer` — and each is
 * also available as a subpath import such as
 * `@trajs/platform-bun/BunCompression`. `BunServices` aggregates them into the layer
 * `@trajs/core`'s `Exchange.layer` is provided with.
 *
 * The modules here import each other relatively rather than through the `imports`
 * field's `#/*`: Bun resolves that field's exact keys but not its wildcards, so a
 * program that runs on Bun could not load this package from source otherwise.
 */

export * as BunCompression from "./BunCompression.ts";

export * as BunServices from "./BunServices.ts";
