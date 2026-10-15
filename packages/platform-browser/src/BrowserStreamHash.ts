/**
 * The BLAKE3 hash a program computes anywhere with: the digest the WebAssembly
 * BLAKE3 `blake3-wasm` carries.
 *
 * {@link layer} is the {@link StreamHash} this package provides the exchange with,
 * and BLAKE3 is what it computes, so a digest it reads agrees with the one
 * `@trajs/platform-node` reads through the Rust binding. The code is imported with
 * this module, which only a program that depends on this package imports.
 */

import { StreamHash } from "@trajs/utils/StreamHash";
import * as blake3 from "blake3-wasm";
import { Layer, Sink } from "effect";

/**
 * The hash a program computes anywhere with, over the WebAssembly BLAKE3
 * `blake3-wasm` carries.
 *
 * **When to use**
 *
 * Use when a program runs where a native addon cannot be loaded — a page, a
 * worker — or when every run should hash a recording with the same code.
 *
 * **Details**
 *
 * Hashing through it is what `@trajs/platform-node`'s hash does through the
 * binding: the bytes of a trajectory are fed to one hash in the order they arrive
 * and a digest is read off it once they have ended.
 *
 * The hash is spent by reading it — the WebAssembly hasher frees itself on the
 * digest — so a digest is read off one made where the sink runs, rather than off a
 * hash that has already let go of the bytes.
 *
 * A bundle is handed the implementation `blake3-wasm` states for the browser, which
 * carries no WebAssembly code of its own: a page provides that code the way the
 * package's own readme says — `blake3/browser` is the entry carrying it. What
 * carries the code itself is the package's Node.js entry, so a program that runs on
 * Node hashes through this layer as it stands.
 *
 * @see {@link StreamHash} for the hash this provides.
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(StreamHash, {
  digest: Sink.reduce(
    () => blake3.createHash(),
    (hashing, chunk: Uint8Array) => {
      hashing.update(chunk);

      return hashing;
    },
  ).pipe(Sink.map((hashing) => hashing.digest("hex"))),
});
