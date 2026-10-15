/**
 * The BLAKE3 hash a program on Node hashes a recording through: the digest the
 * Rust binding `@napi-rs/blake-hash` computes.
 *
 * {@link layer} is the {@link StreamHash} this package provides the exchange with,
 * and BLAKE3 is what it computes, so a digest it reads agrees with the one
 * `@trajs/platform-browser` reads. The binding is imported with this module, which
 * only a program that depends on this package imports: what keeps a native addon
 * out of a page is the package it is in rather than an import deferred to when the
 * layer is provided.
 */

import * as blake3 from "@napi-rs/blake-hash";
import { StreamHash } from "@trajs/utils/StreamHash";
import { Layer, Sink } from "effect";

/**
 * The hash a program on Node hashes through, over the Rust binding
 * `@napi-rs/blake-hash`.
 *
 * **When to use**
 *
 * Use when a program runs on Node and can load a native addon: it is the faster of
 * the two hashes the platform packages state.
 *
 * **Details**
 *
 * The binding is a native addon, so what bundles this package leaves it for the
 * machine the program runs on to resolve rather than following it when the program
 * is built: a bundle carrying one would carry a binding for the platform it was
 * built on alone. Bytes are then fed to the addon as they arrive, and the digest is
 * read off it once they have ended — the binding reads a digest repeatedly, so one
 * is not held: what it returns is what the bytes fed so far hash to, which does not
 * change between reads.
 *
 * What a program that runs where a native addon cannot be loaded provides instead
 * is `@trajs/platform-browser`'s hash; BLAKE3 is what either computes, and the
 * layers agree on the digest of a trajectory whole.
 *
 * @see {@link StreamHash} for the hash this provides.
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(StreamHash, {
  digest: Sink.reduce(
    () => new blake3.Blake3Hasher(),
    (hashing, chunk: Uint8Array) => {
      hashing.update(chunk);

      return hashing;
    },
  ).pipe(Sink.map((hashing) => hashing.digest("hex"))),
});
