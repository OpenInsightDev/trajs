/**
 * The hash a trajectory is named by: the digest of the bytes it carries its parts
 * in.
 *
 * What reads a digest off a stream of bytes is a {@link StreamHash}, and the
 * exchange is built over one, so what hashes a trajectory is a layer's to say
 * rather than the format's: nothing of how a digest is read changes when another
 * hash is provided. Which digest is read — BLAKE3, BLAKE2b or SHA-256
 * ({@link Algorithm}) — is stated where the layer is built ({@link Options}), and
 * what computes it is a platform package's to state: `@trajs/platform-node` and
 * `@trajs/platform-bun` are over the Rust binding `@napi-rs/blake-hash` and
 * `node:crypto`, and `@trajs/platform-browser` is over the WebAssembly BLAKE3
 * `blake3-wasm` carries, over WebCrypto and over the hash this package ships. The
 * digest of one algorithm is one every layer agrees with, so a trajectory one
 * platform names is a trajectory another recognises.
 */

import { blake2b } from "@noble/hashes/blake2.js";
import { blake3 } from "@noble/hashes/blake3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Context, Layer, Sink } from "effect";

/**
 * The digest a trajectory is named by: the algorithm it is read with.
 *
 * **When to use**
 *
 * Use to name the digest a hash layer is built over, where a program states one
 * ({@link Options}).
 *
 * **Details**
 *
 * - `Blake3` (0) is BLAKE3, which is what {@link defaultAlgorithm} names: it is the
 *   digest a trajectory has always been named by, and the one every platform package
 *   states a codec for.
 * - `Blake2b` (1) is BLAKE2b with a digest of 32 bytes — the same length as
 *   BLAKE3's, which is not the 64 bytes an unconfigured BLAKE2b computes — so a
 *   trajectory is named by 64 characters of hex whichever of the two is stated.
 * - `Sha256` (2) is SHA-256.
 *
 * A digest is read by feeding one run of a hash the bytes of one stream, so what an
 * algorithm names is what two programs agree on: they name a trajectory the same way
 * where they state the same one. Which of them named a trajectory is what the
 * trajectory states of itself — the metadata it ends with states the algorithm its
 * digest was read with as that algorithm's code ({@link StreamHash.algorithm}) — so
 * a program handed a trajectory can tell what named it rather than naming it again by
 * an algorithm of its own. The codes are the format's, as they are for the frame a
 * trajectory is carried in: each digest is stated by one of them, and a code is never
 * restated for another digest, so a trajectory is named the way it was named however
 * long after it was written.
 *
 * @see {@link Options} for where an algorithm is stated.
 * @see {@link StreamHash.algorithm} for what a hash states of itself.
 * @category models
 */
export const Algorithm = {
  Blake3: 0,
  Blake2b: 1,
  Sha256: 2,
} as const;

export type Algorithm = (typeof Algorithm)[keyof typeof Algorithm];

/**
 * The digest a hash layer is built over.
 *
 * **When to use**
 *
 * Use where a program states what names its trajectories, or to type what a hash
 * layer is built with.
 *
 * **Details**
 *
 * - `algorithm` is the digest a stream is hashed to ({@link Algorithm}), and
 *   defaults to {@link defaultAlgorithm} — `Blake3` — so a program that states
 *   nothing names its trajectories the way they have always been named.
 *
 * The option is stated where the layer is built rather than where a digest is read,
 * since reading one takes no choice: what a digest is of is a stream of bytes, and
 * what it is read with is the layer. Which one read the digest of a trajectory is
 * what the trajectory states of itself ({@link StreamHash.algorithm}), so a program
 * that reads one back can tell whether it is naming it the way it was named when
 * it was written.
 *
 * @see {@link Algorithm} for the digests a program may state.
 * @category models
 */
export interface Options {
  readonly algorithm?: Algorithm;
}

/**
 * The algorithm a digest is read with when a program states none: `Blake3`.
 *
 * **When to use**
 *
 * Use where a hash layer resolves the option it was built with ({@link Options}),
 * so that what a program stating nothing gets is stated once rather than by each
 * layer.
 *
 * **Details**
 *
 * It is the digest a trajectory has always been named by, so a program that states
 * no algorithm names a trajectory the way a program that stated none named it, and
 * names one written before an algorithm could be stated the way it is named at all.
 *
 * @see {@link Algorithm} for what it names.
 * @category constants
 */
export const defaultAlgorithm: Algorithm = Algorithm.Blake3;

/**
 * A hash of a stream of bytes: the bytes are given to it as a sink, and the digest
 * is read off them once they have ended.
 *
 * **Details**
 *
 * `algorithm` is which algorithm this hash reads a digest with
 * ({@link Algorithm}), which a trajectory states of itself. `digest` is a sink of
 * the bytes of one stream: it consumes them to their end and leaves none of them
 * over, and what it holds when it is done is the digest, as a lowercase hex string
 * of 64 characters. The bytes a trajectory carries its parts in are what it is given
 * — the format's own bytes, so a part of a trajectory is hashed the way
 * `Exchange.Part` carries it rather than the way a program happened to read it —
 * so the digest of a trajectory is the same wherever one is computed from it.
 *
 * The digest is of the algorithm the hash states of itself
 * ({@link StreamHash.algorithm}), and every algorithm a hash states names a digest
 * of 32 bytes — 64 characters of hex — so what a trajectory ends with is the same
 * length whichever one it was named with, and a digest read through one layer is
 * one another layer reads where the two are built over the same algorithm.
 *
 * A hash is of a stream of bytes rather than of a program: two streams are hashed
 * by two runs of the sink, and nothing of one is held for the next. Reading a
 * digest off the bytes of one stream is what the sink is for, and no hash a layer
 * provides fails at it, so the sink states no failure of its own.
 *
 * @see {@link StreamHash} for the service a program reads a digest through.
 */
export interface StreamHash {
  /**
   * Which algorithm this hash reads a digest with, as {@link Algorithm} names it:
   * what a trajectory that was named through it states of itself.
   */
  readonly algorithm: Algorithm;

  /**
   * The digest of the bytes given to it, read once they have ended.
   */
  readonly digest: Sink.Sink<string, Uint8Array, never, never>;
}

/**
 * The hash a trajectory is hashed through: what `yield* StreamHash` gives reads
 * the digest of a stream of bytes ({@link StreamHash}).
 *
 * **When to use**
 *
 * Use to require a hash of a program, and {@link layer} or the layer a platform
 * package ships to provide it.
 *
 * **Details**
 *
 * A digest is read once per stream of bytes rather than held between them, so
 * nothing of it survives a read: two streams are hashed by two runs of the sink,
 * whatever else is going on.
 *
 * @see {@link StreamHash} for what it reads a digest with.
 */
export const StreamHash: Context.Service<StreamHash, StreamHash> = Context.Service<
  StreamHash,
  StreamHash
>()("trajs/utils/StreamHash");

/** One run of a hash of one algorithm, its bytes fed to it as the sink runs. */
const hashing = (algorithm: Algorithm): Sink.Sink<string, Uint8Array, never, never> =>
  Sink.reduce(
    () => {
      switch (algorithm) {
        case Algorithm.Blake2b:
          // BLAKE2b of the length the other two digests are of, rather than the 64
          // bytes one computes where its length is not stated.
          return blake2b.create({ dkLen: 32 });
        case Algorithm.Sha256:
          return sha256.create();
        default:
          return blake3.create();
      }
    },
    (hashed, chunk: Uint8Array) => {
      hashed.update(chunk);

      return hashed;
    },
  ).pipe(Sink.map((hashed) => bytesToHex(hashed.digest())));

/**
 * A hash of one algorithm as the service it is read through: the digest of a
 * stream the layer is built over ({@link StreamHash}).
 *
 * **When to use**
 *
 * Use where a layer is stated over a hash of this package rather than over the one
 * a platform provides — `@trajs/platform-browser` is over this for BLAKE2b, which a
 * browser states no codec for — or where a program provides the service itself
 * rather than through a layer.
 *
 * **Details**
 *
 * It is what {@link layer} provides, as the value a layer is built from, so a
 * `StreamHash` built here and one provided by the layer hash the same bytes to the
 * same digest, and both state the same algorithm. The algorithm defaults to
 * {@link defaultAlgorithm}, as it does for every layer built over one of these
 * hashes.
 *
 * @see {@link layer} for the hash this builds as a layer.
 * @category constructors
 */
export const make = (options?: Options): StreamHash => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;

  return { algorithm, digest: hashing(algorithm) };
};

/**
 * The hash this package ships: BLAKE3, BLAKE2b or SHA-256, as `@noble/hashes`
 * computes them.
 *
 * **When to use**
 *
 * Use when a program hashes a trajectory without a platform package — a page, a
 * worker, a script — or when every run should hash a trajectory with the same code,
 * whatever it is run on: it is the one hash that needs no native addon to be loaded
 * by the machine and no WebAssembly module to be carried, so a program that
 * provides it hashes wherever JavaScript runs.
 *
 * **Details**
 *
 * `@noble/hashes` is JavaScript with no dependencies of its own, so what computes
 * the digest is a module like any other of this package's rather than a binding or
 * a WebAssembly module resolved where the layer is provided: a bundle of a program
 * carries it, which is what a page and a worker can run. The cost of that is the
 * code and the speed of JavaScript against a codec the machine states itself, which
 * is what the platform packages are for.
 *
 * Bytes are fed to one hash as they arrive and the digest is read off it once they
 * have ended, which is how the platform layers read one too: what it computes for an
 * algorithm is what the codecs of the platforms compute for the same one, so a
 * trajectory hashed through it is the trajectory `@trajs/platform-node`,
 * `@trajs/platform-bun` and `@trajs/platform-browser` name — a trajectory one wrote
 * is a trajectory the others load.
 *
 * @see {@link StreamHash} for the hash this provides.
 * @see {@link make} for the same hash as the service rather than as the layer.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<StreamHash> =>
  Layer.succeed(StreamHash, make(options));
