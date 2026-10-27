/**
 * The compression and the hash of `@trajs/utils`, for a Node program.
 *
 * {@link layer} provides both for the exchange layer of `@trajs/core`, beside the
 * storage of a trajectory.
 *
 * @stability stable
 */

import type { Compression } from "@trajs/utils/Compression";
import type { StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as NodeCompression from "#/NodeCompression.ts";
import * as NodeStreamHash from "#/NodeStreamHash.ts";

/**
 * The codecs of a Node program: the compression of `node:zlib` and the digest of
 * `@napi-rs/blake-hash` and `node:crypto`.
 *
 * @see {@link layer} for the provider.
 * @stability stable
 * @category models
 */
export type NodeServices = Compression | StreamHash;

/**
 * The compression and the hash of a Node program.
 *
 * **When to use**
 *
 * Use in a Node program. Provide it beside the storage of a trajectory.
 *
 * **Details**
 *
 * {@link NodeCompression.layer} and {@link NodeStreamHash.layer} provide it.
 * Neither layer states an algorithm, so a call states the one of its write, read
 * or digest.
 *
 * The storage is not among them. File storage comes from `@trajs/utils` beside
 * this layer, and another storage from the program itself.
 *
 * A program with its own compression or hash merges the layers instead of using
 * this one.
 *
 * @see {@link NodeServices} for the provided services.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<NodeServices> = Layer.merge(
  NodeCompression.layer,
  NodeStreamHash.layer,
);
