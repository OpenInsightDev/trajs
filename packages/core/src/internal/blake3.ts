/**
 * The BLAKE3 hash a trajectory is fingerprinted with, as the Rust binding
 * `@napi-rs/blake-hash` computes it.
 *
 * {@link layer} is the {@link Fingerprint} `Indexing.nodeLayer` provides an index
 * with, over the binding itself: what a fingerprint is of is the format's — the
 * bytes a recording carries its parts in — and what hashes them is this.
 */

import { Effect, Layer } from "effect";

import { Fingerprint, type Hasher } from "#/Indexing.ts";

/**
 * A hasher over the binding: bytes are fed to the addon as they arrive, and the
 * fingerprint is read off it once they have ended.
 *
 * The binding reads a digest repeatedly, so the fingerprint is not held: what it
 * returned is what the bytes fed so far hash to, which does not change between
 * reads.
 */
const hasher = (blake3: typeof import("@napi-rs/blake-hash")): Hasher => {
  const hashing = new blake3.Blake3Hasher();

  return {
    update: (bytes) => {
      hashing.update(bytes);
    },
    digest: () => hashing.digest("hex"),
  };
};

/**
 * The fingerprint `Indexing.nodeLayer` provides an index with: BLAKE3 computed
 * by the Rust binding, which is the faster of the two this package states and
 * the one only a program that runs on Node loads.
 *
 * The binding is a native addon, so a program that bundles one loads it at run
 * time rather than at build time: what is imported here is left as it stands for
 * the runtime to resolve — `@vite-ignore` is what says so to the bundler this
 * repository builds with — since a bundle that followed the addon to the machine
 * it was built on would carry a binding for that machine alone.
 *
 * @see {@link Fingerprint} for the service this provides.
 */
export const layer: Layer.Layer<Fingerprint> = Layer.effect(
  Fingerprint,
  Effect.promise(() => import(/* @vite-ignore */ "@napi-rs/blake-hash")).pipe(
    Effect.map((blake3) => ({ hasher: () => hasher(blake3) })),
  ),
);
