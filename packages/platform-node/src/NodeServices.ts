/**
 * The codecs a program on Node runs with, from one place: the compression
 * `node:zlib` writes and reads a frame with, and the digest the Rust binding
 * `@napi-rs/blake-hash` and `node:crypto` compute.
 *
 * {@link layer} is what a program that runs on Node provides `@trajs/core`'s
 * `Exchange.layer` with, beside where it keeps a recording.
 */

import type { Compression, Options as CompressionOptions } from "@trajs/utils/Compression";
import type { Options as StreamHashOptions, StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as NodeCompression from "#/NodeCompression.ts";
import * as NodeStreamHash from "#/NodeStreamHash.ts";

/**
 * The codecs a program on Node runs with: its parts carried in a frame
 * `node:zlib` writes and reads, and the digest read off them by the Rust binding
 * and `node:crypto`.
 *
 * @see {@link layer} for the layer that provides them.
 * @category models
 */
export type NodeServices = Compression | StreamHash;

/**
 * The codecs a program on Node runs with, as what {@link layer} is built from.
 *
 * **When to use**
 *
 * Use where a program states how its recordings are carried and what names them,
 * or to type what a layer of these codecs is built with.
 *
 * **Details**
 *
 * - `compression` is what {@link NodeCompression.layer} is built with: the
 *   algorithm a recording's parts are carried in ({@link CompressionOptions}),
 *   which `@trajs/utils`'s `Compression` states.
 * - `hash` is what {@link NodeStreamHash.layer} is built with: the algorithm those
 *   parts are named by ({@link StreamHashOptions}), which `@trajs/utils`'s
 *   `StreamHash` states.
 *
 * Either may be left out, and neither is required: a layer built over no options
 * carries and names a recording the way it has always been carried and named — in
 * a zstd frame, by a BLAKE3 digest.
 *
 * @see {@link layer} for what it is given to.
 * @category models
 */
export interface Options {
  readonly compression?: CompressionOptions;
  readonly hash?: StreamHashOptions;
}

/**
 * The service implementations a program on Node provides `Exchange.layer` with.
 *
 * **When to use**
 *
 * Use when a program runs on Node: it is the layer `Exchange.layer` is provided
 * with, beside the storage where a recording is kept.
 *
 * **Details**
 *
 * It is {@link NodeCompression.layer} and {@link NodeStreamHash.layer} at the
 * algorithms given ({@link Options}), so where a recording is kept is not among
 * them: a program that keeps its recordings as files provides `@trajs/utils`'s file
 * storage beside this layer, and one that keeps them somewhere else provides a
 * storage of its own.
 *
 * A program that provides one of the two some other way — over another codec, or
 * over a hash of its own — merges the layers itself rather than building this one.
 *
 * @see {@link NodeServices} for the codecs it provides.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<NodeServices> =>
  Layer.merge(NodeCompression.layer(options?.compression), NodeStreamHash.layer(options?.hash));
