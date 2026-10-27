/**
 * The digest of a trajectory's parts on Node: BLAKE3, BLAKE2b or SHA-256.
 *
 * {@link layer} provides the {@link StreamHash} of this package. One algorithm
 * yields the same digest as every other platform package. This module imports the
 * native binding, so only a package with a dependency on it loads the binding.
 *
 * @stability stable
 */

import { createHash } from "node:crypto";

import * as blake from "@napi-rs/blake-hash";
import { Algorithm, StreamHash, defaultAlgorithm, type Options } from "@trajs/utils/StreamHash";
import { Layer, Sink } from "effect";

/**
 * The state of one running hash: chunked input, and a digest at the end.
 *
 * The binding's hashers and the `node:crypto` hashers take the same calls. Bytes
 * go in, and hex comes out, so one sink serves every algorithm.
 */
interface Hashing {
  /** Feeds one chunk of the stream to the hash. */
  update(chunk: Uint8Array): void;

  /** Reads the digest of the input so far, as lowercase hex. */
  digest(format: "hex"): string;
}

/**
 * The hasher of one algorithm: the binding's, and SHA-256 from `node:crypto`.
 *
 * BLAKE2b runs at 32 bytes, the length of the other two digests. An unconfigured
 * BLAKE2b computes 64. The length belongs to the digest, so this matches
 * `@trajs/utils` and not the `blake2b512` of `node:crypto`.
 */
const hashers: Record<Algorithm, () => Hashing> = {
  [Algorithm.enums.Blake2b]: () => {
    const params = new blake.Blake2BParam();
    params.hashLength(32);

    const hashing = blake.Blake2BHasher.withParams(params);

    return {
      digest: (format) => hashing.digest(format),
      // The binding accepts `Buffer` and `Uint8Array` at run time. A chunk passes
      // through as the same memory, not a copy.
      update: (chunk) => {
        hashing.update(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      },
    };
  },
  [Algorithm.enums.Blake3]: () => new blake.Blake3Hasher(),
  [Algorithm.enums.Sha256]: () => createHash("sha256"),
};

const hashing = (algorithm: Algorithm): Sink.Sink<string, Uint8Array, never, never> =>
  Sink.reduce(hashers[algorithm], (hashed, chunk: Uint8Array) => {
    hashed.update(chunk);

    return hashed;
  }).pipe(Sink.map((hashed) => hashed.digest("hex")));

/**
 * The hash of a Node program: `@napi-rs/blake-hash` and `node:crypto`.
 *
 * **When to use**
 *
 * Use in a Node program with a native addon. BLAKE3 and BLAKE2b come from the
 * binding, and SHA-256 from `node:crypto`.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own ({@link Options}).
 * An omitted algorithm means BLAKE3, the historical digest and the faster of the
 * two binding hashers.
 *
 * The binding is a native addon, so a bundle leaves it for the target machine to
 * resolve. A bundle with the binding carries one platform only.
 *
 * Bytes arrive chunk by chunk, and the digest is read at the end. The binding
 * reads a digest repeatedly, and `node:crypto` reads one once.
 *
 * A program without a native addon uses `@trajs/platform-browser`. One algorithm
 * yields the same digest on both.
 *
 * @see {@link StreamHash} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(StreamHash, {
  digest: (options?: Options) => hashing(options?.algorithm ?? defaultAlgorithm),
});
