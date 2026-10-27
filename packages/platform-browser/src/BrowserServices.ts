/**
 * The compression, the hash and the checksum of `@trajs/utils`, for a program
 * without `node:zlib`.
 *
 * {@link layer} provides all three for the exchange layer of `@trajs/core`, beside
 * the storage of a trajectory.
 *
 * @stability stable
 */

import { type Checksum, layer as ChecksumLayer } from "@trajs/utils/Checksum";
import { type Compression } from "@trajs/utils/Compression";
import { type StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as BrowserCompression from "#/BrowserCompression.ts";
import * as BrowserStreamHash from "#/BrowserStreamHash.ts";

/**
 * The compression, the hash and the checksum of a browser program.
 *
 * @see {@link layer} for the provider.
 * @stability stable
 * @category models
 */
export type BrowserServices = Compression | StreamHash | Checksum;

/**
 * The compression, the hash and the checksum of a browser program.
 *
 * **When to use**
 *
 * Use in a page or a worker, without `node:zlib`. Use it as well when every run
 * should write and read with the same codecs.
 *
 * **Details**
 *
 * {@link BrowserCompression.layer} and {@link BrowserStreamHash.layer} provide the
 * compression and the hash, and neither states an algorithm, so a call states the
 * one of its write, read or digest.
 *
 * A page states no CRC of its own, so the checksum is the tables of
 * `@trajs/utils` (`Checksum.layer` there), which read the number `node:zlib` and
 * `Bun.hash.crc32` read.
 *
 * The storage is not among them. A page keeps a trajectory in the bytes it was
 * handed or in its own store, so the program supplies a storage beside this layer.
 *
 * @see {@link BrowserServices} for the provided services.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<BrowserServices> = Layer.mergeAll(
  BrowserCompression.layer,
  BrowserStreamHash.layer,
  ChecksumLayer,
);
