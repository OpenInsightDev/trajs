/**
 * The platform services a program that runs where WebAssembly does runs with, from
 * one place: the compression the browser's own codecs and the WebAssembly zstd codec
 * write and read a frame with, and the hash the WebAssembly BLAKE3, WebCrypto and the
 * JavaScript hash of `@trajs/utils` read a digest with.
 *
 * {@link layer} is the layer a program that runs where `node:zlib` is not provides
 * `@trajs/core`'s `Exchange.layer` with, beside where it keeps its trajectories.
 */

import { type Compression, type Options as CompressionOptions } from "@trajs/utils/Compression";
import { type Options as StreamHashOptions, type StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as BrowserCompression from "#/BrowserCompression.ts";
import * as BrowserStreamHash from "#/BrowserStreamHash.ts";

/**
 * The services a program computes anywhere with: its parts carried in a frame the
 * browser's own codecs and the WebAssembly zstd codec write and read, and the digest
 * the WebAssembly BLAKE3, WebCrypto and the JavaScript hash read.
 *
 * @see {@link layer} for the layer that provides them.
 * @category models
 */
export type BrowserServices = Compression | StreamHash;

/**
 * The services a program that runs where WebAssembly does runs with, as what
 * {@link layer} is built from.
 *
 * **When to use**
 *
 * Use where a program states how its trajectories are carried and what names them, or
 * to type what a layer of these services is built with.
 *
 * **Details**
 *
 * - `compression` is what {@link BrowserCompression.layer} is built with: the
 *   algorithm a trajectory's parts are carried in ({@link CompressionOptions}), which
 *   `@trajs/utils`'s `Compression` states.
 * - `hash` is what {@link BrowserStreamHash.layer} is built with: the algorithm
 *   those parts are named by ({@link StreamHashOptions}), which `@trajs/utils`'s
 *   `StreamHash` states.
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
 * The service implementations a program that runs where WebAssembly does provides
 * `Exchange.layer` with.
 *
 * **When to use**
 *
 * Use when a program has no `node:zlib` — a page, a worker — or when every run
 * should write and read a trajectory with the same codecs.
 *
 * **Details**
 *
 * It is {@link BrowserCompression.layer} and {@link BrowserStreamHash.layer} at the
 * algorithms given ({@link Options}), so what a program provides decides both how a
 * trajectory is carried and what names it. Where a trajectory is kept is not among
 * them: where a page keeps one — the bytes it was handed, a store in it — is the
 * program's to say, so it provides a storage of its own beside this layer.
 *
 * @see {@link BrowserServices} for the services it provides.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<BrowserServices> =>
  Layer.merge(
    BrowserCompression.layer(options?.compression),
    BrowserStreamHash.layer(options?.hash),
  );
