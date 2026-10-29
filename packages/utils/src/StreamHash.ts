/**
 * The digest of a trajectory's parts.
 *
 * {@link StreamHash.digest} reads the digest of one stream.
 * {@link StreamHash.start} reads one of a sequence fed to it over several writes.
 * A platform package supplies the codecs, and `@trajs/platform-node` and `@trajs/platform-bun`
 * use `@node-rs/xxhash` and `node:crypto`.
 * `@trajs/platform-browser` uses WebCrypto and the hash of this package.
 *
 * The algorithm is stated per call ({@link Options}).
 * One algorithm yields one digest on every platform, so a digest read on one platform reads back
 * on another.
 *
 * @stability stable
 */

import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Context, Layer, Schema, Sink } from "effect";

import { create as createXxh32 } from "#/internal/xxh32.ts";

/**
 * The digest algorithm of a trajectory's parts.
 *
 * **When to use**
 *
 * Use to state the digest of one call ({@link Options}), or to read the recorded
 * digest of a trajectory.
 *
 * **Details**
 *
 * - `Sha256` (0) is SHA-256, at 32 digest bytes.
 * - `Blake2b512` (1) is BLAKE2b at 64 digest bytes, the `blake2b512` of
 *   `node:crypto`.
 * - `Xxh32` (2) is XXH32, at 4 digest bytes. {@link defaultAlgorithm} is
 *   `Xxh32`.
 *
 * A digest has the bytes of its algorithm, which a trajectory records as
 * lowercase hex: 64 characters for SHA-256, 128 for BLAKE2b, and 8 for XXH32.
 *
 * @see {@link Options} for the algorithm of one call.
 * @stability stable
 * @category models
 */
export const Algorithm = Schema.Enum({
  Sha256: 0,
  Blake2b512: 1,
  Xxh32: 2,
} as const);

export type Algorithm = Schema.Schema.Type<typeof Algorithm>;

/**
 * The digest option of one hash call.
 *
 * **When to use**
 *
 * Use to state the algorithm of {@link StreamHash.digest}.
 *
 * **Details**
 *
 * `algorithm` holds the algorithm ({@link Algorithm}). {@link defaultAlgorithm}
 * applies when `algorithm` is omitted.
 *
 * One hash handles every algorithm of its platform. State `algorithm` per call to
 * digest different trajectories. The metadata records the algorithm of a
 * trajectory.
 *
 * @see {@link Algorithm} for the available digests.
 * @stability stable
 * @category models
 */
export interface Options {
  readonly algorithm?: Algorithm;
}

/**
 * The default algorithm: `Xxh32`.
 *
 * **When to use**
 *
 * Use in a hash to resolve an omitted option ({@link Options}).
 *
 * **Details**
 *
 * A call without an algorithm digests with XXH32, the cheapest of the three.
 * The metadata records the algorithm of a digest, so a read states the one the
 * write did.
 *
 * **Gotchas**
 *
 * XXH32 is not a cryptographic digest, so two different sequences of parts can
 * share a digest. State `Sha256` or `Blake2b512` where a collision must not
 * occur.
 *
 * @see {@link Algorithm} for the code.
 * @stability stable
 * @category constants
 */
export const defaultAlgorithm: Algorithm = Algorithm.enums.Xxh32;

/**
 * A digest being computed: bytes fed to it, and the digest read once they end.
 *
 * **When to use**
 *
 * Use where the bytes of a digest arrive over several writes rather than one
 * stream, such as the digest of one chunk beside a frontier over the digests
 * before it. Use it as well to read a digest where no stream ends.
 *
 * **Details**
 *
 * - `update` feeds bytes to the digest, and may be called as often as wanted.
 * - `digest` reads the digest of the bytes fed so far, as the bytes of its
 *   algorithm.
 *
 * Each running digest keeps its own state, and bytes fed to one never reach
 * another. No running digest of a layer fails.
 *
 * **Gotchas**
 *
 * `digest` reads one digest and spends the state. `node:crypto` spends its
 * hash on reading, so updating after a digest is not part of what a running
 * digest does. A caller reading several points of one sequence begins a running
 * digest per span.
 *
 * @see {@link StreamHash.start} for the operation that begins one.
 * @stability stable
 * @category models
 */
export interface Hashing {
  /**
   * Feeds one sequence of bytes to the digest.
   */
  readonly update: (bytes: Uint8Array) => void;

  /**
   * Reads the digest of the bytes fed so far, as the bytes of its algorithm.
   *
   * {@link StreamHash.digest} states the same digest as the lowercase hex
   * characters a recorded digest is written with.
   */
  readonly digest: () => Uint8Array;
}

/**
 * The hash service of the exchange.
 *
 * **Details**
 *
 * - `digest` takes an algorithm ({@link Options}) and returns a sink. The sink
 *   consumes one stream and holds its digest as lowercase hex characters.
 * - `start` takes the same algorithm and returns a {@link Hashing} that bytes
 *   are fed to over several writes.
 *
 * {@link defaultAlgorithm} applies when no algorithm is given. Both forms read
 * the same digest of the same bytes, so what one writes the other reads.
 *
 * The sink reads the format bytes, so every platform hashes the same part bytes.
 * Each run keeps its own state, and two runs share nothing. No hash of a layer
 * fails, so the sink declares no error.
 *
 * @see {@link Options} for the algorithm of one call.
 * @stability stable
 * @category services
 */
export interface StreamHash {
  /**
   * The digest of the bytes given to it, read once they have ended.
   */
  readonly digest: (options?: Options) => Sink.Sink<string, Uint8Array, never, never>;

  /**
   * The digest of bytes fed to it over several writes, as its bytes
   * ({@link Hashing}).
   */
  readonly start: (options?: Options) => Hashing;
}

/**
 * The hash of the exchange.
 *
 * **When to use**
 *
 * Use to require a hash. Provide {@link layer} or the layer of a platform
 * package.
 *
 * **Details**
 *
 * Each call reads one digest and keeps nothing between calls. State the algorithm
 * per call ({@link Options}).
 *
 * @see {@link StreamHash} for the operation.
 * @stability stable
 * @category tags
 */
export const StreamHash: Context.Service<StreamHash, StreamHash> = Context.Service<
  StreamHash,
  StreamHash
>()("trajs/utils/StreamHash");

const running = (algorithm: Algorithm): Hashing => {
  switch (algorithm) {
    // An unconfigured BLAKE2b computes 64 bytes, which is `blake2b512`.
    case Algorithm.enums.Blake2b512:
      return digestOf(blake2b.create());
    case Algorithm.enums.Sha256:
      return digestOf(sha256.create());
    case Algorithm.enums.Xxh32:
      return digestOf(createXxh32());
  }
};

const digestOf = (hashed: {
  readonly update: (bytes: Uint8Array) => void;
  readonly digest: () => Uint8Array;
}): Hashing => ({
  digest: () => hashed.digest(),
  update: (bytes) => {
    hashed.update(bytes);
  },
});

const hashing = (algorithm: Algorithm): Sink.Sink<string, Uint8Array, never, never> =>
  Sink.reduce(
    () => running(algorithm),
    (running: Hashing, chunk: Uint8Array) => {
      running.update(chunk);

      return running;
    },
  ).pipe(Sink.map((running) => bytesToHex(running.digest())));

/**
 * The hash of this package as a service.
 *
 * **When to use**
 *
 * Use to state a layer over the hash of this package instead of a platform hash.
 * `@trajs/platform-browser` uses it for BLAKE2b and XXH32, because a browser
 * supplies neither codec. Use it as well to provide the service without a layer.
 *
 * **Details**
 *
 * {@link layer} provides this value. A `StreamHash` from here and one from the
 * layer read the same digest. {@link defaultAlgorithm} applies to a call without
 * an algorithm.
 *
 * @see {@link layer} for the same hash as a layer.
 * @stability stable
 * @category constructors
 */
export const make = (): StreamHash => ({
  digest: (options) => hashing(options?.algorithm ?? defaultAlgorithm),
  start: (options) => running(options?.algorithm ?? defaultAlgorithm),
});

/**
 * The hash of this package: SHA-256, BLAKE2b-512 or XXH32, computed by
 * `@noble/hashes` and the XXH32 of this package.
 *
 * **When to use**
 *
 * Use to hash without a platform package, such as in a page, a worker or a
 * script. Use it as well when every run should hash with the same code. It needs
 * no native addon and no WebAssembly module, so it runs wherever JavaScript runs.
 *
 * **Details**
 *
 * `@noble/hashes` is JavaScript without dependencies, so a program bundle carries
 * it. The cost is bundle size and JavaScript speed against a native codec.
 *
 * Bytes arrive chunk by chunk, and the digest is read at the end. One algorithm
 * yields the same digest as the platform packages, so they read the same
 * trajectory.
 *
 * @see {@link StreamHash} for the service of this hash.
 * @see {@link make} for the same hash as a service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(StreamHash, make());
