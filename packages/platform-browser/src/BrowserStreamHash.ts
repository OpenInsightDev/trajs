/**
 * The digest of a trajectory's parts in a browser: WebCrypto, `@noble/hashes` and
 * the WebAssembly XXH64 of `@node-rs/xxhash-wasm32-wasi`.
 *
 * {@link layer} provides the {@link StreamHash} of this package. One algorithm
 * yields the same digest as every other platform package. This module imports the
 * codecs, so only a package with a dependency on them loads them, and the
 * WebAssembly module of XXH64 is read by {@link layer}.
 *
 * @stability stable
 */

import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  Algorithm,
  StreamHash,
  defaultAlgorithm,
  type Hashing,
  type Options,
} from "@trajs/utils/StreamHash";
import { Effect, Layer, Sink } from "effect";

/** The sink of one digest: bytes in, a hex digest out. */
type Digest = Sink.Sink<string, Uint8Array, never, never>;

/** The WebAssembly module of XXH64, read when the layer is built. */
type Module = typeof import("@node-rs/xxhash-wasm32-wasi");

/** What SHA-256 is asked of WebCrypto as. */
const Sha256 = "SHA-256";

/** The bytes the digest of XXH64 holds. */
const DigestBytes = 8;

/**
 * The chunks in one buffer.
 *
 * WebCrypto holds no streaming hash. `crypto.subtle.digest` takes the whole input
 * at once, so the chunks are kept until the end.
 */
const held = (chunks: ReadonlyArray<Uint8Array>): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

/**
 * The SHA-256 sink: the chunks are kept and digested in one WebCrypto call.
 *
 * WebCrypto needs a secure context, so a page over plain HTTP has no SHA-256.
 * BLAKE2b and XXH64 need no page context. A refused digest is a defect, because
 * no hash of a layer fails.
 */
const webCrypto: Digest = Sink.reduce<Array<Uint8Array>, Uint8Array>(
  () => [],
  (chunks, chunk) => {
    chunks.push(chunk);

    return chunks;
  },
).pipe(
  Sink.mapEffect((chunks) =>
    Effect.promise(async () =>
      bytesToHex(new Uint8Array(await crypto.subtle.digest(Sha256, held(chunks)))),
    ),
  ),
);

/** A digest of `@noble/hashes` as {@link Hashing} takes it. */
const digested = (hashed: {
  readonly update: (bytes: Uint8Array) => void;
  readonly digest: () => Uint8Array;
}): Hashing => ({
  digest: () => hashed.digest(),
  update: (bytes) => {
    hashed.update(bytes);
  },
});

const running = (module: Module, algorithm: Algorithm): Hashing => {
  switch (algorithm) {
    // An unconfigured BLAKE2b computes 64 bytes, which is `blake2b512`.
    case Algorithm.enums.Blake2b512:
      return digested(blake2b.create());
    case Algorithm.enums.Sha256:
      return digested(sha256.create());
    case Algorithm.enums.Xxh64: {
      const hashing = new module.Xxh64();

      return {
        // The module reads the digest as the 64-bit value it is, and the digest
        // of XXH64 is that value big-endian.
        digest: () => {
          const digest = new Uint8Array(DigestBytes);

          new DataView(digest.buffer).setBigUint64(0, hashing.digest());

          return digest;
        },
        update: (bytes) => {
          hashing.update(bytes);
        },
      };
    }
  }
};

/**
 * The sink of one algorithm: SHA-256 from WebCrypto, and a running digest
 * otherwise.
 */
const hashing = (module: Module, algorithm: Algorithm): Digest =>
  algorithm === Algorithm.enums.Sha256
    ? webCrypto
    : Sink.reduce(
        () => running(module, algorithm),
        (running: Hashing, chunk: Uint8Array) => {
          running.update(chunk);

          return running;
        },
      ).pipe(Sink.map((running) => bytesToHex(running.digest())));

/** The hash of a browser, over the WebAssembly module {@link layer} reads. */
const make = (module: Module): StreamHash => ({
  digest: (options?: Options) => hashing(module, options?.algorithm ?? defaultAlgorithm),
  start: (options?: Options) => running(module, options?.algorithm ?? defaultAlgorithm),
});

/**
 * The hash of a browser: WebCrypto, `@noble/hashes` and the WebAssembly XXH64.
 *
 * **When to use**
 *
 * Use in a page or a worker, where a native addon is not available. Use it as well
 * when every run should hash with the same code.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own ({@link Options}).
 * An omitted algorithm means XXH64.
 *
 * SHA-256 comes from WebCrypto, with one call over the whole stream, and from
 * `@noble/hashes` where the bytes arrive over several writes. BLAKE2b comes from
 * `@noble/hashes`, and XXH64 from the WebAssembly module.
 *
 * A digest has the bytes of its algorithm: 128 hex characters for BLAKE2b, 64
 * for SHA-256, and 16 for XXH64.
 *
 * **Gotchas**
 *
 * The layer fetches and instantiates the WebAssembly module while it is built,
 * so importing this module costs nothing. A page that cannot fetch the module
 * fails to build the layer.
 *
 * @see {@link StreamHash} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.effect(
  StreamHash,
  Effect.map(
    Effect.promise(() => import("@node-rs/xxhash-wasm32-wasi")),
    make,
  ),
);
