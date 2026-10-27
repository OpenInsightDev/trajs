/**
 * The compression and the hash of `@trajs/utils`, for a program without
 * `node:zlib`.
 *
 * {@link layer} provides both for the exchange layer of `@trajs/core`, beside the
 * storage of a trajectory.
 *
 * @stability stable
 */

import { type Compression } from "@trajs/utils/Compression";
import { type StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as BrowserCompression from "#/BrowserCompression.ts";
import * as BrowserStreamHash from "#/BrowserStreamHash.ts";

/**
 * The compression and the hash of a browser program.
 *
 * @see {@link layer} for the provider.
 * @stability stable
 * @category models
 */
export type BrowserServices = Compression | StreamHash;

/**
 * The compression and the hash of a browser program.
 *
 * **When to use**
 *
 * Use in a page or a worker, without `node:zlib`. Use it as well when every run
 * should write and read with the same codecs.
 *
 * **Details**
 *
 * {@link BrowserCompression.layer} and {@link BrowserStreamHash.layer} provide it.
 * Neither layer states an algorithm, so a call states the one of its write, read
 * or digest.
 *
 * The storage is not among them. A page keeps a trajectory in the bytes it was
 * handed or in its own store, so the program supplies a storage beside this layer.
 *
 * @see {@link BrowserServices} for the provided services.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<BrowserServices> = Layer.merge(
  BrowserCompression.layer,
  BrowserStreamHash.layer,
);
