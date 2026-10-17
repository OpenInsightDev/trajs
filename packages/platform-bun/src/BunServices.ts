/**
 * The codecs a program on Bun runs with, from one place: the compression Bun
 * writes and reads a frame with, and the digest the Rust binding
 * `@napi-rs/blake-hash` and `node:crypto` compute.
 *
 * {@link layer} is what a program that runs on Bun provides `@trajs/core`'s
 * `Exchange.layer` with, beside where it keeps a trajectory.
 */

import * as NodeStreamHash from "@trajs/platform-node/NodeStreamHash";
import type { Compression, Options as CompressionOptions } from "@trajs/utils/Compression";
import type { Options as StreamHashOptions, StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as BunCompression from "./BunCompression.ts";

/**
 * The codecs a program on Bun runs with: its parts carried in a frame Bun writes and
 * reads, and the digest read off them by the Rust binding and `node:crypto`.
 *
 * @see {@link layer} for the layer that provides them.
 * @category models
 */
export type BunServices = Compression | StreamHash;

/**
 * The codecs a program on Bun runs with, as what {@link layer} is built from.
 *
 * **When to use**
 *
 * Use where a program states how its trajectories are carried and what names them, or
 * to type what a layer of these codecs is built with.
 *
 * **Details**
 *
 * - `compression` is what {@link BunCompression.layer} is built with: the algorithm
 *   a trajectory's parts are carried in ({@link CompressionOptions}), which
 *   `@trajs/utils`'s `Compression` states.
 * - `hash` is what `@trajs/platform-node`'s `NodeStreamHash.layer` is built with:
 *   the algorithm those parts are named by ({@link StreamHashOptions}), which
 *   `@trajs/utils`'s `StreamHash` states.
 *
 * Either may be left out, and neither is required: a layer built over no options
 * carries and names a trajectory the way it has always been carried and named — in a
 * zstd frame, by a BLAKE3 digest.
 *
 * @see {@link layer} for what it is given to.
 * @category models
 */
export interface Options {
  readonly compression?: CompressionOptions;
  readonly hash?: StreamHashOptions;
}

/**
 * The service implementations a program on Bun provides `Exchange.layer` with.
 *
 * **When to use**
 *
 * Use when a program runs on Bun: it is the layer `Exchange.layer` is provided with,
 * beside the storage where a trajectory is kept.
 *
 * **Details**
 *
 * Bun states no BLAKE3 of its own, so the digest is the one `@trajs/platform-node`
 * reads through the Rust binding `@napi-rs/blake-hash`, which Bun loads; what Bun
 * states itself is the compression ({@link BunCompression.layer}), as
 * `@effect/platform-bun` stands on `@effect/platform-node`. BLAKE2b and SHA-256 are
 * read through that same layer — `node:crypto` is Bun's own where it is asked for
 * one — so every algorithm is one a codec of Bun computes.
 *
 * Both layers are built at the algorithms given ({@link Options}), so where a
 * trajectory is kept is not among them: a program that keeps its trajectories as files
 * provides `@trajs/utils`'s file storage beside this layer.
 *
 * @see {@link BunServices} for the codecs it provides.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<BunServices> =>
  Layer.merge(BunCompression.layer(options?.compression), NodeStreamHash.layer(options?.hash));
