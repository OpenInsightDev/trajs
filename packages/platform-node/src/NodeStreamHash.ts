/**
 * The digest a program on Node hashes a recording through: BLAKE3, BLAKE2b or
 * SHA-256, as the Rust binding `@napi-rs/blake-hash` and `node:crypto` compute
 * them.
 *
 * {@link layer} is the {@link StreamHash} this package provides the exchange with,
 * and what it computes for an algorithm agrees with what every other platform
 * package computes for the same one, so a digest it reads is a recording the others
 * load. The binding is imported with this module, which only a program that depends
 * on this package imports: what keeps a native addon out of a page is the package
 * it is in rather than an import deferred to when the layer is provided.
 */

import { createHash } from "node:crypto";

import * as blake from "@napi-rs/blake-hash";
import {
  StreamHash,
  defaultAlgorithm,
  type Algorithm,
  type Options,
} from "@trajs/utils/StreamHash";
import { Layer, Sink } from "effect";

/**
 * What a hash of one algorithm is fed the bytes of a stream with, and a digest read
 * off once they have ended.
 *
 * The binding's hashers and the ones `node:crypto` states are read the same way —
 * bytes in, the digest of them out as hex — so one sink serves every algorithm.
 */
interface Hashing {
  /** Feeds one chunk of the stream to the hash. */
  update(chunk: Uint8Array): void;

  /** Reads the digest of the bytes fed so far, as the lowercase hex a recording ends with. */
  digest(format: "hex"): string;
}

/**
 * What computes a digest of one algorithm here: the binding's, and SHA-256, which
 * `node:crypto` states.
 *
 * BLAKE2b is read at 32 bytes — the length of the other two digests, and so of what
 * a recording ends with — rather than at the 64 an unconfigured BLAKE2b computes,
 * and the length is part of the digest rather than a cut of it, so this is the BLAKE2b
 * the JavaScript hash of `@trajs/utils` computes and not the one `node:crypto`
 * states as `blake2b512`.
 */
const hashers: Record<Algorithm, () => Hashing> = {
  blake2b: () => {
    const params = new blake.Blake2BParam();
    params.hashLength(32);

    const hashing = blake.Blake2BHasher.withParams(params);

    return {
      digest: (format) => hashing.digest(format),
      // The binding states BLAKE2b's bytes as the `Buffer` its BLAKE3 hasher states
      // as a `Uint8Array`, and reads either at run time; a chunk is handed over as
      // the bytes it is rather than as a copy of them.
      update: (chunk) => {
        hashing.update(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      },
    };
  },
  blake3: () => new blake.Blake3Hasher(),
  sha256: () => createHash("sha256"),
};

/** One run of a hash of the algorithm given: the bytes of a stream fed to it as they arrive, the digest read off them at the end. */
const hashing = (algorithm: Algorithm): Sink.Sink<string, Uint8Array, never, never> =>
  Sink.reduce(hashers[algorithm], (hashed, chunk: Uint8Array) => {
    hashed.update(chunk);

    return hashed;
  }).pipe(Sink.map((hashed) => hashed.digest("hex")));

/**
 * The hash a program on Node hashes through, over the Rust binding
 * `@napi-rs/blake-hash` and `node:crypto`.
 *
 * **When to use**
 *
 * Use when a program runs on Node and can load a native addon: BLAKE3 and BLAKE2b
 * are computed by the Rust binding rather than in JavaScript, and SHA-256 by
 * `node:crypto`, which is the core a program on Node already runs.
 *
 * **Details**
 *
 * The binding is a native addon, so what bundles this package leaves it for the
 * machine the program runs on to resolve rather than following it when the program
 * is built: a bundle carrying one would carry a binding for the platform it was
 * built on alone. Bytes are fed to one hash as they arrive, and the digest is read
 * off it once they have ended — the binding reads a digest repeatedly where
 * `node:crypto` reads one once, and what either gives back is the digest of the
 * bytes fed so far.
 *
 * The algorithm is the layer's to state ({@link Options}), and defaults to BLAKE3,
 * the digest a recording has always been named by and the faster of the two the
 * binding computes.
 *
 * What a program that runs where a native addon cannot be loaded provides instead
 * is `@trajs/platform-browser`'s hash; what each computes for an algorithm is the
 * digest of it, and the layers agree on the digest of a trajectory whole.
 *
 * @see {@link StreamHash} for the hash this provides.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<StreamHash> => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;

  return Layer.succeed(StreamHash, {
    algorithm,
    digest: hashing(algorithm),
  });
};
