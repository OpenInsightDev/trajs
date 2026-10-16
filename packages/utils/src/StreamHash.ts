/**
 * The BLAKE3 hash a recording is named by: the digest of the bytes it carries its
 * parts in.
 *
 * What reads a digest off a stream of bytes is a {@link StreamHash}, and the
 * exchange is built over one, so what hashes a recording is a layer's to say
 * rather than the format's: nothing of how a digest is read changes when another
 * hash is provided. The one this package ships is {@link layer}, which is the BLAKE3
 * `@noble/hashes` computes, in JavaScript, so it runs wherever JavaScript does. The
 * layers over what a platform provides are a platform package's to state —
 * `@trajs/platform-node` and `@trajs/platform-bun` are over the Rust binding
 * `@napi-rs/blake-hash`, and `@trajs/platform-browser` is over the WebAssembly BLAKE3
 * `blake3-wasm` carries — and BLAKE3 is what every one of them computes, so a digest
 * one layer reads the others agree with.
 */

import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Context, Layer, Sink } from "effect";

/**
 * A hash of a stream of bytes: the bytes are given to it as a sink, and the digest
 * is read off them once they have ended.
 *
 * **Details**
 *
 * `digest` is a sink of the bytes of one stream: it consumes them to their end and
 * leaves none of them over, and what it holds when it is done is the digest, as a
 * lowercase hex string of 64 characters. The bytes a recording carries its parts in
 * are what it is given — the format's own bytes, so a part of a recording is hashed
 * the way `Exchange.Part` carries it rather than the way a program happened to read
 * it — so the digest of a trajectory is the same wherever one is computed from it.
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

/**
 * The hash this package ships: the BLAKE3 `@noble/hashes` computes.
 *
 * **When to use**
 *
 * Use when a program hashes a recording without a platform package — a page, a
 * worker, a script — or when every run should hash a recording with the same code
 * whatever it is run on: it is the one hash that needs no native addon to be loaded
 * by the machine and no WebAssembly module to be carried, so a program that
 * provides it hashes wherever JavaScript runs.
 *
 * **Details**
 *
 * `@noble/hashes` is JavaScript with no dependencies of its own, so what computes
 * the digest is a module like any other of this package's rather than a binding
 * resolved where the layer is provided: a bundle of a program carries it, which is
 * what a page and a worker can run.
 *
 * Bytes are fed to one hash as they arrive and the digest is read off it once they
 * have ended, which is how the platform layers read one too: BLAKE3 is what it
 * computes, so a recording hashed through it is the recording
 * `@trajs/platform-node`, `@trajs/platform-bun` and `@trajs/platform-browser` read,
 * and a digest one layer reads another agrees with — a recording one wrote is a
 * recording the others load.
 *
 * @see {@link StreamHash} for the hash this provides.
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(StreamHash, {
  digest: Sink.reduce(
    () => blake3.create(),
    (hashing, chunk: Uint8Array) => {
      hashing.update(chunk);

      return hashing;
    },
  ).pipe(Sink.map((hashing) => bytesToHex(hashing.digest()))),
});
