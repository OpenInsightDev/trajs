/**
 * The codecs a program on Bun runs with, from one place: the compression
 * `Bun.zstdCompress` writes and reads a frame with, and the BLAKE3 the Rust binding
 * `@napi-rs/blake-hash` computes.
 *
 * {@link layer} is what a program that runs on Bun provides `@trajs/core`'s
 * `Exchange.layer` with, beside where it keeps a recording.
 */

import * as NodeStreamHash from "@trajs/platform-node/NodeStreamHash";
import type { Compression } from "@trajs/utils/Compression";
import type { StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as BunCompression from "./BunCompression.ts";

/**
 * The codecs a program on Bun runs with: its parts carried in a frame
 * `Bun.zstdCompress` writes and reads, and the digest read off them by the Rust
 * binding.
 *
 * @see {@link layer} for the layer that provides them.
 * @category models
 */
export type BunServices = Compression | StreamHash;

/**
 * The service implementations a program on Bun provides `Exchange.layer` with.
 *
 * **When to use**
 *
 * Use when a program runs on Bun: it is the layer `Exchange.layer` is provided
 * with, beside the storage where a recording is kept.
 *
 * **Details**
 *
 * Bun states no BLAKE3 of its own, so the digest is the one `@trajs/platform-node`
 * reads through the Rust binding `@napi-rs/blake-hash`, which Bun loads; what Bun
 * states itself is the compression ({@link BunCompression.layer}), as
 * `@effect/platform-bun` stands on `@effect/platform-node`. Where a recording is
 * kept is not among them: a program that keeps its recordings as files provides
 * `@trajs/utils`'s file storage beside this layer.
 *
 * @see {@link BunServices} for the codecs it provides.
 * @category layers
 */
export const layer: Layer.Layer<BunServices> = Layer.merge(
  BunCompression.layer,
  NodeStreamHash.layer,
);
