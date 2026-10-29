/**
 * The digest of a trajectory's parts on Bun: `Bun.CryptoHasher` and the hash of
 * `@trajs/utils`.
 *
 * {@link layer} provides the {@link StreamHash} of this package. One algorithm
 * yields the same digest as every other platform package. This module imports
 * the codecs, so only a package with a dependency on it loads them.
 *
 * @stability stable
 */

import {
  Algorithm,
  StreamHash,
  defaultAlgorithm,
  make as hashInJavaScript,
  type Hashing,
  type Options,
} from "@trajs/utils/StreamHash";
import { CryptoHasher } from "bun";
import { Layer, Sink } from "effect";

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
    case Algorithm.enums.Xxh32:
      // `Bun.hash.xxHash32` reads a whole input at once, and a digest here is
      // fed a chunk at a time, so XXH32 comes from the hash of `@trajs/utils`.
      return hashInJavaScript().start({ algorithm });
  }
};

const hashing = (algorithm: Algorithm): Sink.Sink<string, Uint8Array, never, never> =>
  Sink.reduce(
    () => running(algorithm),
    (running: Hashing, chunk: Uint8Array) => {
      running.update(chunk);

      return running;
    },
  ).pipe(Sink.map((running) => Buffer.from(running.digest()).toString("hex")));

/**
 * The hash of a Bun program: `Bun.CryptoHasher` and the JavaScript hash of
 * `@trajs/utils`.
 *
 * **When to use**
 *
 * Use in a Bun program. Provide it beside the storage of a trajectory.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own ({@link Options}).
 * An omitted algorithm means XXH32.
 *
 * SHA-256 and BLAKE2b-512 come from `Bun.CryptoHasher`, which digests a chunk at
 * a time. `Bun.hash.xxHash32` reads a whole input, so XXH32 comes from the
 * JavaScript hash of `@trajs/utils`, which reads a digest the same way.
 *
 * A digest has the bytes of its algorithm: 128 hex characters for BLAKE2b, 64
 * for SHA-256, and 8 for XXH32.
 *
 * @see {@link StreamHash} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(StreamHash, {
  digest: (options?: Options) => hashing(options?.algorithm ?? defaultAlgorithm),
  start: (options?: Options) => running(options?.algorithm ?? defaultAlgorithm),
});
