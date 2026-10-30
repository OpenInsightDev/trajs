/**
 * The digest of a trajectory's parts.
 *
 * {@link StreamHash.digest} reads the digest of one stream.
 * {@link StreamHash.start} reads one of a sequence fed to it over several writes.
 * A platform package supplies the running digests of its runtime through
 * {@link make}.
 * `@trajs/platform-node` and `@trajs/platform-bun` use `node:crypto` and the binding
 * `@node-rs/xxhash`, and `@trajs/platform-browser` uses `@noble/hashes` and the
 * WebAssembly module of `@node-rs/xxhash-wasm32-wasi`.
 *
 * The algorithm is stated per call ({@link Options}).
 * One algorithm yields one digest on every platform, so a digest read on one platform reads back
 * on another.
 *
 * @stability stable
 */

import { Context, Schema, Sink } from "effect";

import { digestOf, startOf } from "#/internal/stream-hash.ts";

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
 * - `Xxh64` (2) is XXH64, at 8 digest bytes. {@link defaultAlgorithm} is
 *   `Xxh64`.
 *
 * A digest has the bytes of its algorithm, which a trajectory records as
 * lowercase hex: 64 characters for SHA-256, 128 for BLAKE2b, and 16 for XXH64.
 *
 * @see {@link Options} for the algorithm of one call.
 * @stability stable
 * @category models
 */
export const Algorithm = Schema.Enum({
  Sha256: 0,
  Blake2b512: 1,
  Xxh64: 2,
} as const);

export type Algorithm = Schema.Schema.Type<typeof Algorithm>;

/**
 * The digest option of one hash call.
 *
 * **When to use**
 *
 * Use to state the algorithm and the digest bytes of {@link StreamHash.digest}.
 *
 * **Details**
 *
 * - `algorithm` holds the algorithm ({@link Algorithm}). {@link defaultAlgorithm}
 *   applies when `algorithm` is omitted.
 * - `length` holds the digest bytes to read, as a count from 1 to the bytes of
 *   the algorithm. Every byte of the algorithm applies when `length` is omitted.
 *
 * One hash handles every algorithm of its platform. State `algorithm` per call to
 * digest different trajectories. The metadata records the algorithm of a
 * trajectory, not the `length` of a call.
 *
 * **Gotchas**
 *
 * A `length` beyond the bytes of the algorithm raises a `RangeError` when the call
 * is made, rather than reading a shorter digest.
 *
 * A digest shorter than its algorithm is the leading bytes of the whole digest.
 * BLAKE2b reads shorter digests of its own, which differ from that.
 *
 * @see {@link Algorithm} for the available digests.
 * @stability stable
 * @category models
 */
export interface Options {
  readonly algorithm?: Algorithm;
  readonly length?: number;
}

/**
 * The default algorithm: `Xxh64`.
 *
 * **When to use**
 *
 * Use in a hash to resolve an omitted option ({@link Options}).
 *
 * **Details**
 *
 * A call without an algorithm digests with XXH64, the cheapest of the three.
 * The metadata records the algorithm of a digest, so a read states the one the
 * write did.
 *
 * **Gotchas**
 *
 * XXH64 is not a cryptographic digest, so two different sequences of parts can
 * share a digest. State `Sha256` or `Blake2b512` where a collision must not
 * occur.
 *
 * @see {@link Algorithm} for the code.
 * @stability stable
 * @category constants
 */
export const defaultAlgorithm: Algorithm = Algorithm.enums.Xxh64;

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
 * - `digest` reads the digest of the bytes fed so far, as the digest bytes the
 *   call states ({@link Options.length}).
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
   * Reads the digest of the bytes fed so far, as the digest bytes the call states.
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
 * the same digest of the same bytes under the same options, so what one writes the
 * other reads.
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
 * Use to require a hash. Provide the layer of a platform package.
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

/**
 * The digests a platform reads, one running digest per algorithm.
 *
 * **When to use**
 *
 * Use in a platform package, to state what its runtime reads a digest with.
 *
 * **Details**
 *
 * `start` begins the running digest of the algorithm it is given ({@link Hashing}).
 * A codec states no options: what a call reads is resolved where {@link make}
 * reads it.
 *
 * @see {@link make} for the service it builds.
 * @stability stable
 * @category models
 */
export interface Codec {
  readonly start: (algorithm: Algorithm) => Hashing;
}

/**
 * The hash of a platform's codecs as a service.
 *
 * **When to use**
 *
 * Use in a platform package to provide {@link StreamHash} over the digests its
 * runtime reads.
 *
 * **Details**
 *
 * Both forms are derived here from the codec ({@link Codec}). The options of a
 * call are resolved ({@link Options}), the digest is cut to the bytes the call
 * states, and it is read as lowercase hex characters. A platform therefore states
 * one running digest per algorithm, and nothing of the options.
 *
 * **Gotchas**
 *
 * The options are read where a call is made, so a `length` beyond the bytes of the
 * algorithm raises a `RangeError` at the call, rather than through the sink.
 *
 * @see {@link Codec} for what a platform states.
 * @see {@link StreamHash} for the service this builds.
 * @stability stable
 * @category constructors
 */
export const make = (codec: Codec): StreamHash => ({
  digest: (options?: Options) => digestOf(codec, options),
  start: (options?: Options) => startOf(codec, options),
});
