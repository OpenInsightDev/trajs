/**
 * The BLAKE3 hash a recording is named by: the digest of the bytes it carries its
 * parts in.
 *
 * What reads a digest off a stream of bytes is a {@link StreamHash}, and the
 * exchange is built over one, so what hashes a recording is a layer's to say
 * rather than the format's: nothing of how a digest is read changes when another
 * hash is provided. The layers are a platform package's to state —
 * `@trajs/platform-node` is over the Rust binding `@napi-rs/blake-hash`, and
 * `@trajs/platform-browser` is over the WebAssembly BLAKE3 `blake3-wasm` carries —
 * and BLAKE3 is what either computes, so a digest one layer writes the other agrees
 * with.
 */

import { Context, Sink } from "effect";

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
 * digest off the bytes of one stream is what the sink is for, and neither hash this
 * package's platform layers provide fails at it, so the sink states no failure of
 * its own.
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
 * Use to require a hash of a program, and the layer a platform package ships to
 * provide it.
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
