/**
 * The digest of a trajectory's parts in a browser: `@noble/hashes` and the
 * WebAssembly XXH64 of `@node-rs/xxhash-wasm32-wasi`.
 *
 * {@link layer} provides the {@link StreamHash} of this package. One algorithm
 * yields the same digest as every other platform package. This module imports the
 * codecs, so only a package with a dependency on them loads them, and the
 * WebAssembly module of XXH64 is read by {@link layer}.
 *
 * @stability stable
 */

import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { Algorithm, StreamHash, type Hashing, make } from "@trajs/utils/StreamHash";
import { Effect, Layer } from "effect";

/** The WebAssembly module of XXH64, read when the layer is built. */
type Module = typeof import("@node-rs/xxhash-wasm32-wasi");

/** The bytes the digest of XXH64 holds. */
const DigestBytes = 8;

/** A digest of `@noble/hashes` as {@link Hashing} takes it. */
const digested = (hashed: {
  readonly update: (bytes: Uint8Array) => void;
  readonly digest: () => Uint8Array;
}): Hashing => ({
  digest: () => hashed.digest(),
  update: (bytes) => {
    hashed.update(bytes);
  },
});

const running = (module: Module, algorithm: Algorithm): Hashing => {
  switch (algorithm) {
    // An unconfigured BLAKE2b computes 64 bytes, which is `blake2b512`.
    case Algorithm.enums.Blake2b512:
      return digested(blake2b.create());
    case Algorithm.enums.Sha256:
      return digested(sha256.create());
    case Algorithm.enums.Xxh64: {
      const hashing = new module.Xxh64();

      return {
        // The module reads the digest as the 64-bit value it is, and the digest
        // of XXH64 is that value big-endian.
        digest: () => {
          const digest = new Uint8Array(DigestBytes);

          new DataView(digest.buffer).setBigUint64(0, hashing.digest());

          return digest;
        },
        update: (bytes) => {
          hashing.update(bytes);
        },
      };
    }
  }
};

/**
 * The hash of a browser: `@noble/hashes` and the WebAssembly XXH64.
 *
 * **When to use**
 *
 * Use in a page or a worker, where a native addon is not available. Use it as well
 * when every run should hash with the same code.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own algorithm and digest
 * bytes (`StreamHash.Options`). An omitted algorithm means XXH64. A call may state
 * fewer digest bytes, which reads the leading bytes of the digest.
 *
 * SHA-256 and BLAKE2b come from `@noble/hashes`, and XXH64 from the WebAssembly
 * module. Every algorithm is fed a chunk at a time.
 *
 * A digest has the bytes of its algorithm: 128 hex characters for BLAKE2b, 64
 * for SHA-256, and 16 for XXH64.
 *
 * **Gotchas**
 *
 * The layer fetches and instantiates the WebAssembly module while it is built,
 * so importing this module costs nothing. A page that cannot fetch the module
 * fails to build the layer.
 *
 * @see {@link StreamHash} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.effect(
  StreamHash,
  Effect.map(
    Effect.promise(() => import("@node-rs/xxhash-wasm32-wasi")),
    (module) => make({ start: (algorithm) => running(module, algorithm) }),
  ),
);
