/**
 * The BLAKE3 hash a recording is named by: the digest of the bytes it carries its
 * parts in.
 *
 * What reads a digest off a stream of bytes is a {@link StreamHash}, and the
 * exchange is built over one, so what hashes a recording is a layer's to say
 * rather than the format's: nothing of how a digest is read changes when another
 * hash is provided. The two layers this module states differ in what they need to
 * run, and neither is loaded unless it is provided — {@link nodeLayer} is over the
 * Rust binding `@napi-rs/blake-hash`, and {@link wasmLayer} is over the WebAssembly
 * BLAKE3 `blake3-wasm` carries — and BLAKE3 is what either computes, so a digest
 * one layer writes the other agrees with.
 *
 * Nothing here is published: a program reaches a hash through
 * `Exchange.nodeLayer` or `Exchange.wasmLayer`.
 */

import { Context, Effect, Layer, Sink } from "effect";

import { TrajectoryError } from "#/TrajectoryError.ts";

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
 * by two runs of the sink, and nothing of one is held for the next.
 *
 * @see {@link StreamHash} for the service a program reads a digest through.
 */
export interface StreamHash {
  /**
   * The digest of the bytes given to it, read once they have ended.
   */
  readonly digest: Sink.Sink<string, Uint8Array, never, TrajectoryError>;
}

/**
 * The hash a trajectory is hashed through: what `yield* StreamHash` gives reads
 * the digest of a stream of bytes ({@link StreamHash}).
 *
 * **Details**
 *
 * A digest is read once per stream of bytes rather than held between them, so
 * nothing of it survives a read: two streams are hashed by two runs of the sink,
 * whatever else is going on.
 *
 * **Example** (Hashing the bytes of a recording)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const hash = yield* StreamHash
 *
 *   return yield* Stream.run(Stream.make(new TextEncoder().encode("hello")), hash.digest)
 * })
 *
 * const digest = await Effect.runPromise(Effect.provide(program, nodeLayer))
 *
 * digest // => "ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f"
 * ```
 *
 * @see {@link StreamHash} for what it reads a digest with.
 */
export const StreamHash: Context.Service<StreamHash, StreamHash> = Context.Service<
  StreamHash,
  StreamHash
>()("trajs/core/Hash/StreamHash");

/**
 * A hash over the Rust binding: bytes are fed to the addon as they arrive, and the
 * digest is read off it once they have ended.
 *
 * The binding reads a digest repeatedly, so one is not held: what it returns is
 * what the bytes fed so far hash to, which does not change between reads.
 */
const nodeHash = (blake3: typeof import("@napi-rs/blake-hash")): StreamHash => ({
  digest: Sink.reduce(
    () => new blake3.Blake3Hasher(),
    (hashing, chunk: Uint8Array) => {
      hashing.update(chunk);

      return hashing;
    },
  ).pipe(Sink.map((hashing) => hashing.digest("hex"))),
});

/**
 * The hash a program on Node hashes through, over the Rust binding
 * `@napi-rs/blake-hash`.
 *
 * **Details**
 *
 * The binding is a native addon, so it is loaded when this layer is provided rather
 * than when this module is imported: a program that never provides it — a page —
 * never reaches for it. A program that bundles its code loads the addon from the
 * machine it runs on rather than from the machine it was built on, since a bundle
 * carrying one would carry a binding for that platform alone: the import is left as
 * it stands for the runtime to resolve rather than followed when the program is
 * built. What a program that runs where a native addon cannot be loaded provides
 * instead is {@link wasmLayer}; BLAKE3 is what either computes, and the layers agree
 * on the digest of a trajectory whole.
 *
 * @see {@link StreamHash} for the hash this provides.
 */
export const nodeLayer: Layer.Layer<StreamHash> = Layer.effect(
  StreamHash,
  Effect.promise(() => import(/* @vite-ignore */ "@napi-rs/blake-hash")).pipe(Effect.map(nodeHash)),
);

/**
 * The hash a program computes anywhere with, over the WebAssembly BLAKE3
 * `blake3-wasm` carries.
 *
 * **Details**
 *
 * The WebAssembly code is loaded when this layer is provided rather than when this
 * module is imported, and hashing through it is what {@link nodeLayer} does through
 * the binding: the bytes of a trajectory are fed to one hash in the order they
 * arrive and a digest is read off it once they have ended.
 *
 * The hash is spent by reading it — the WebAssembly hasher frees itself on the
 * digest — so a digest is read off one made where the sink runs, rather than off a
 * hash that has already let go of the bytes.
 *
 * A bundle is handed the implementation `blake3-wasm` states for the browser, which
 * carries no WebAssembly code of its own: a page provides that code the way the
 * package's own readme says — `blake3/browser` is the entry carrying it. What
 * carries the code itself is the package's Node.js entry, so a program that runs on
 * Node hashes through this layer as it stands.
 *
 * @see {@link StreamHash} for the hash this provides.
 */
export const wasmLayer: Layer.Layer<StreamHash> = Layer.unwrap(
  Effect.promise(() => import("blake3-wasm")).pipe(
    Effect.map((blake3) =>
      Layer.succeed(StreamHash, {
        digest: Sink.reduce(
          () => blake3.createHash(),
          (hashing, chunk: Uint8Array) => {
            hashing.update(chunk);

            return hashing;
          },
        ).pipe(Sink.map((hashing) => hashing.digest("hex"))),
      }),
    ),
  ),
);
