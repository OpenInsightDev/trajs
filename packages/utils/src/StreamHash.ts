/**
 * The digest of a trajectory's parts.
 *
 * A {@link StreamHash} reads the digest of one stream
 * ({@link StreamHash.digest}), or of a sequence fed to it over several writes
 * ({@link StreamHash.start}). The exchange runs over a hash, so a platform
 * package supplies the codecs. `@trajs/platform-node` and
 * `@trajs/platform-bun` use `@napi-rs/blake-hash` and `node:crypto`.
 * `@trajs/platform-browser` uses `blake3-wasm`, WebCrypto and the hash of this
 * package.
 *
 * The algorithm is stated per call ({@link Options}). One algorithm yields one
 * digest on every platform, so a digest read on one platform reads back on
 * another.
 *
 * @stability stable
 */

import { blake2b } from "@noble/hashes/blake2.js";
import { blake3 } from "@noble/hashes/blake3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Context, Layer, Schema, Sink } from "effect";

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
 * - `Blake3` (0) is BLAKE3. {@link defaultAlgorithm} is `Blake3`.
 * - `Blake2b` (1) is BLAKE2b with 32 digest bytes. An unconfigured BLAKE2b
 *   computes 64 bytes, so the length belongs to the digest.
 * - `Sha256` (2) is SHA-256.
 *
 * Each digest has 32 bytes, or 64 hex characters. A trajectory carries a digest
 * of that length for every algorithm.
 *
 * Each code is a format contract. A code always names the same digest, so an old
 * trajectory decodes with its recorded code.
 *
 * @see {@link Options} for the algorithm of one call.
 * @stability stable
 * @category models
 */
export const Algorithm = Schema.Enum({
  Blake3: 0,
  Blake2b: 1,
  Sha256: 2,
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
 * The default algorithm: `Blake3`.
 *
 * **When to use**
 *
 * Use in a hash to resolve an omitted option ({@link Options}).
 *
 * **Details**
 *
 * `Blake3` is the historical digest of a trajectory. A call without an algorithm
 * reads what an earlier call without one wrote. Older trajectories digest the
 * same way.
 *
 * @see {@link Algorithm} for the code.
 * @stability stable
 * @category constants
 */
export const defaultAlgorithm: Algorithm = Algorithm.enums.Blake3;

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
 * - `digest` reads the digest of the bytes fed so far, as 64 lowercase hex
 *   characters.
 *
 * Each running digest keeps its own state, and bytes fed to one never reach
 * another. No running digest of a layer fails.
 *
 * **Gotchas**
 *
 * `digest` reads one digest and spends the state. The WebAssembly BLAKE3 of a
 * page frees itself on reading, and `node:crypto` spends its hash, so updating
 * after a digest is not part of what a running digest does. A caller reading
 * several points of one sequence begins a running digest per span.
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
   * Reads the digest of the bytes fed so far, as 64 lowercase hex characters.
   */
  readonly digest: () => string;
}

/**
 * The hash service of the exchange.
 *
 * **Details**
 *
 * - `digest` takes an algorithm ({@link Options}) and returns a sink. The sink
 *   consumes one stream and holds its digest as 64 lowercase hex characters.
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
   * The digest of bytes fed to it over several writes ({@link Hashing}).
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
    case Algorithm.enums.Blake2b:
      // BLAKE2b at 32 bytes, the length of the other two digests. An
      // unconfigured BLAKE2b computes 64.
      return digestOf(blake2b.create({ dkLen: 32 }));
    case Algorithm.enums.Sha256:
      return digestOf(sha256.create());
    default:
      return digestOf(blake3.create());
  }
};

const digestOf = (hashed: {
  readonly update: (bytes: Uint8Array) => void;
  readonly digest: () => Uint8Array;
}): Hashing => ({
  digest: () => bytesToHex(hashed.digest()),
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
  ).pipe(Sink.map((running) => running.digest()));

/**
 * The hash of this package as a service.
 *
 * **When to use**
 *
 * Use to state a layer over the hash of this package instead of a platform hash.
 * `@trajs/platform-browser` uses it for BLAKE2b, because a browser supplies no
 * BLAKE2b codec. Use it as well to provide the service without a layer.
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
 * The hash of this package: BLAKE3, BLAKE2b or SHA-256, computed by
 * `@noble/hashes`.
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
