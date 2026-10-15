/**
 * The platform services a program that runs where WebAssembly does runs with, from
 * one place: the compression the WebAssembly zstd codec writes and reads a frame
 * with, and the hash the WebAssembly BLAKE3 `blake3-wasm` carries.
 *
 * {@link layer} is the layer a program that runs where `node:zlib` is not provides
 * `@trajs/core`'s `Exchange.layer` with, beside where it keeps its recordings.
 */

import type { Compression } from "@trajs/utils/Compression";
import type { StreamHash } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

import * as BrowserCompression from "#/BrowserCompression.ts";
import * as BrowserStreamHash from "#/BrowserStreamHash.ts";

/**
 * The services a program computes anywhere with: its parts carried in a frame the
 * WebAssembly zstd codec writes and reads, and the digest the WebAssembly BLAKE3
 * carries.
 *
 * @see {@link layer} for the layer that provides them.
 * @category models
 */
export type BrowserServices = Compression | StreamHash;

/**
 * The service implementations a program that runs where WebAssembly does provides
 * `Exchange.layer` with.
 *
 * **When to use**
 *
 * Use when a program has no `node:zlib` — a page, a worker — or when every run
 * should write and read a recording with the same codec.
 *
 * **Details**
 *
 * It is {@link BrowserCompression.layer} and {@link BrowserStreamHash.layer}
 * merged. Where a recording is kept is not among them: where a page keeps one — the
 * bytes it was handed, a store in it — is the program's to say, so it provides a
 * storage of its own beside this layer.
 *
 * @see {@link BrowserServices} for the services it provides.
 * @category layers
 */
export const layer: Layer.Layer<BrowserServices> = Layer.merge(
  BrowserCompression.layer,
  BrowserStreamHash.layer,
);
