/**
 * The digest of a trajectory's parts on Node: SHA-256, BLAKE2b-512 or XXH64.
 *
 * {@link layer} provides the {@link StreamHash} of this package. One algorithm
 * yields the same digest as every other platform package. This module imports the
 * native binding, so only a package with a dependency on it loads the binding.
 *
 * @stability stable
 */

import { createHash } from "node:crypto";

import { Xxh64 } from "@node-rs/xxhash";
import { Algorithm, StreamHash, type Hashing, make } from "@trajs/utils/StreamHash";
import { Layer } from "effect";

/**
 * The hasher of one algorithm: `node:crypto` for the cryptographic digests, and
 * the binding `@node-rs/xxhash` for XXH64.
 */
const hashers: Record<Algorithm, () => Hashing> = {
  [Algorithm.enums.Blake2b512]: () => {
    const hashing = createHash("blake2b512");

    return {
      digest: () => hashing.digest(),
      update: (chunk) => {
        hashing.update(chunk);
      },
    };
  },
  [Algorithm.enums.Sha256]: () => {
    const hashing = createHash("sha256");

    return {
      digest: () => hashing.digest(),
      update: (chunk) => {
        hashing.update(chunk);
      },
    };
  },
  [Algorithm.enums.Xxh64]: () => {
    const hashing = new Xxh64();

    return {
      // The binding reads the digest as the 64-bit value it is, and the digest
      // of XXH64 is that value big-endian.
      digest: () => {
        const digest = new Uint8Array(8);

        new DataView(digest.buffer).setBigUint64(0, hashing.digest());

        return digest;
      },
      update: (chunk) => {
        hashing.update(chunk);
      },
    };
  },
};

/**
 * The hash of a Node program: `node:crypto` and `@node-rs/xxhash`.
 *
 * **When to use**
 *
 * Use in a Node program with a native addon. SHA-256 and BLAKE2b-512 come from
 * `node:crypto`, and XXH64 from the binding.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own algorithm and digest
 * bytes (`StreamHash.Options`). An omitted algorithm means XXH64, the cheapest of
 * the three. A call may state fewer digest bytes, which reads the leading bytes of
 * the digest.
 *
 * The binding is a native addon, so a bundle leaves it for the target machine to
 * resolve. A bundle with the binding carries one platform only.
 *
 * Bytes arrive chunk by chunk, and the digest is read at the end, whether one
 * sink carries the stream or `start` is fed over several writes. `node:crypto`
 * reads a digest once, and the binding reads it repeatedly.
 *
 * A program without a native addon uses `@trajs/platform-browser`. One algorithm
 * yields the same digest on both.
 *
 * @see {@link StreamHash} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(
  StreamHash,
  make({ start: (algorithm) => hashers[algorithm]() }),
);
