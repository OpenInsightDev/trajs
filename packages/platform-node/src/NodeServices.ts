/**
 * The compression, the hash and the checksum of `@trajs/utils`, for a Node
 * program.
 *
 * {@link layer} provides all three for the exchange layer of `@trajs/core`, beside
 * the storage of a trajectory.
 *
 * @stability stable
 */

import type { Checksum } from "@trajs/utils/Checksum";
import type { Compression } from "@trajs/utils/Compression";
import type { StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as NodeChecksum from "#/NodeChecksum.ts";
import * as NodeCompression from "#/NodeCompression.ts";
import * as NodeStreamHash from "#/NodeStreamHash.ts";

/**
 * The codecs of a Node program: the compression of `node:zlib`, the digest of
 * `@napi-rs/blake-hash` and `node:crypto`, and the checksum of `zlib.crc32`.
 *
 * @see {@link layer} for the provider.
 * @stability stable
 * @category models
 */
export type NodeServices = Compression | StreamHash | Checksum;

/**
 * The compression, the hash and the checksum of a Node program.
 *
 * **When to use**
 *
 * Use in a Node program. Provide it beside the storage of a trajectory.
 *
 * **Details**
 *
 * {@link NodeCompression.layer}, {@link NodeStreamHash.layer} and
 * {@link NodeChecksum.layer} provide it. None of them states an algorithm, so a
 * call states the one of its write, read, digest or checksum.
 *
 * The storage is not among them. File storage comes from `@trajs/utils` beside
 * this layer, and another storage from the program itself.
 *
 * A program with its own compression, hash or checksum merges the layers instead of
 * using this one.
 *
 * @see {@link NodeServices} for the provided services.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<NodeServices> = Layer.mergeAll(
  NodeCompression.layer,
  NodeStreamHash.layer,
  NodeChecksum.layer,
);
