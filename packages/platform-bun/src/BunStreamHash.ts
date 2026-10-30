/**
 * The digest of a trajectory's parts on Bun: `Bun.CryptoHasher` and the binding
 * `@node-rs/xxhash`.
 *
 * {@link layer} provides the {@link StreamHash} of this package. One algorithm
 * yields the same digest as every other platform package. This module imports the
 * codecs, so only a package with a dependency on them loads them.
 *
 * @stability stable
 */

import { Xxh64 } from "@node-rs/xxhash";
import { Algorithm, StreamHash, type Hashing, make } from "@trajs/utils/StreamHash";
import { CryptoHasher } from "bun";
import { Layer } from "effect";

/** The running digest of one `Bun.CryptoHasher`, as {@link Hashing} takes it. */
const digested = (hashing: CryptoHasher): Hashing => ({
  digest: () => hashing.digest(),
  update: (bytes) => {
    hashing.update(bytes);
  },
});

const running = (algorithm: Algorithm): Hashing => {
  switch (algorithm) {
    case Algorithm.enums.Blake2b512:
      return digested(new CryptoHasher("blake2b512"));
    case Algorithm.enums.Sha256:
      return digested(new CryptoHasher("sha256"));
    case Algorithm.enums.Xxh64: {
      // `Bun.hash.xxHash64` reads a whole input at once, and a digest here is fed
      // a chunk at a time, so XXH64 comes from the binding.
      const hashing = new Xxh64();

      return {
        // The binding reads the digest as the 64-bit value it is, and the digest
        // of XXH64 is that value big-endian.
        digest: () => {
          const digest = new Uint8Array(8);

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
 * The hash of a Bun program: `Bun.CryptoHasher` and the binding `@node-rs/xxhash`.
 *
 * **When to use**
 *
 * Use in a Bun program. Provide it beside the storage of a trajectory.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own algorithm and digest
 * bytes (`StreamHash.Options`). An omitted algorithm means XXH64. A call may state
 * fewer digest bytes, which reads the leading bytes of the digest.
 *
 * SHA-256 and BLAKE2b-512 come from `Bun.CryptoHasher`, which digests a chunk at
 * a time. `Bun.hash.xxHash64` reads a whole input, so XXH64 comes from the binding,
 * which reads a digest the same way.
 *
 * A digest has the bytes of its algorithm: 128 hex characters for BLAKE2b, 64
 * for SHA-256, and 16 for XXH64.
 *
 * @see {@link StreamHash} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(StreamHash, make({ start: running }));
