/**
 * The codecs a program on Node runs with, from one place: the compression
 * `node:zlib` writes and reads a frame with, and the hash the Rust binding
 * `@napi-rs/blake-hash` computes.
 *
 * {@link layer} is what a program that runs on Node provides
 * `@trajs/core`'s `Exchange.layer` with, beside where it keeps a recording.
 */

import type { Compression } from "@trajs/utils/Compression";
import type { StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as NodeCompression from "#/NodeCompression.ts";
import * as NodeStreamHash from "#/NodeStreamHash.ts";

/**
 * The codecs a program on Node runs with: its parts carried in a frame `node:zlib`
 * writes and reads, and the digest read off them by the Rust binding.
 *
 * @see {@link layer} for the layer that provides them.
 * @category models
 */
export type NodeServices = Compression | StreamHash;

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
 * It is {@link NodeCompression.layer} and {@link NodeStreamHash.layer} merged, so
 * where a recording is kept is not among them: a program that keeps its recordings
 * as files provides `@trajs/utils`'s file storage beside this layer, and one that
 * keeps them somewhere else provides a storage of its own.
 *
 * @see {@link NodeServices} for the codecs it provides.
 * @category layers
 */
export const layer: Layer.Layer<NodeServices> = Layer.merge(
  NodeCompression.layer,
  NodeStreamHash.layer,
);
