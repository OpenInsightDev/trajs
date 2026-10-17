/**
 * The hash a program computes anywhere with: the BLAKE3 digest the WebAssembly
 * BLAKE3 `blake3-wasm` carries, the SHA-256 WebCrypto reads, and the BLAKE2b the
 * hash of `@trajs/utils` computes.
 *
 * {@link layer} is the {@link StreamHash} this package provides the exchange with.
 * What each digest is agrees with what every other platform package computes for the
 * same algorithm, so a trajectory one layer names the others recognise. The codecs
 * are imported with this module, which only a program that depends on this package
 * imports.
 */

import {
  Algorithm,
  StreamHash,
  defaultAlgorithm,
  make as hashInJavaScript,
  type Options,
} from "@trajs/utils/StreamHash";
import * as blake3 from "blake3-wasm";
import { Effect, Layer, Sink } from "effect";

/** A digest as a browser reads one: the bytes of a stream in, the digest of them out. */
type Hashing = Sink.Sink<string, Uint8Array, never, never>;

/** What SHA-256 is asked of WebCrypto as. */
const Sha256 = "SHA-256";

/**
 * The bytes of a stream as one buffer, which is what a browser digests at once.
 *
 * WebCrypto states no digest of a stream — `crypto.subtle.digest` is one call over
 * the bytes it is given — so what it reads is held while it is read, where a hash
 * that takes one chunk at a time is not.
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

/** The digest of bytes as the lowercase hex a trajectory ends with. */
const hex = (bytes: Uint8Array): string => {
  let text = "";

  for (const byte of bytes) {
    text += byte.toString(16).padStart(2, "0");
  }

  return text;
};

/**
 * The SHA-256 digest WebCrypto reads: the bytes of the stream collected as they
 * arrive, digested in one call once they have ended.
 *
 * WebCrypto is served over a secure context, so a page served as plain HTTP has no
 * SHA-256 to read — BLAKE2b and BLAKE3 are the digests that need nothing of the
 * page's context. A digest it refuses is a defect rather than a failure, as no hash
 * a layer provides fails.
 */
const webCrypto: Hashing = Sink.reduce<Array<Uint8Array>, Uint8Array>(
  () => [],
  (chunks, chunk) => {
    chunks.push(chunk);

    return chunks;
  },
).pipe(
  Sink.mapEffect((chunks) =>
    Effect.promise(async () =>
      hex(new Uint8Array(await crypto.subtle.digest(Sha256, held(chunks)))),
    ),
  ),
);

/**
 * The BLAKE3 digest the WebAssembly `blake3-wasm` carries: the bytes fed to one hash
 * as they arrive, the digest read off it once they have ended.
 *
 * The hash is spent by reading it — the WebAssembly hasher frees itself on the
 * digest — so a digest is read off one made where the sink runs, rather than off a
 * hash that has already let go of the bytes.
 */
const webAssembly: Hashing = Sink.reduce(
  () => blake3.createHash(),
  (hashed, chunk: Uint8Array) => {
    hashed.update(chunk);

    return hashed;
  },
).pipe(Sink.map((hashed) => hashed.digest("hex")));

/** The digest of one algorithm, as the sink a stream is hashed through. */
const digest = (algorithm: Algorithm): Hashing => {
  switch (algorithm) {
    case Algorithm.Blake2b:
      return hashInJavaScript({ algorithm }).digest;
    case Algorithm.Sha256:
      return webCrypto;
    default:
      return webAssembly;
  }
};

/**
 * The hash a program computes anywhere with, over the codecs a page states.
 *
 * **When to use**
 *
 * Use when a program runs where a native addon cannot be loaded — a page, a worker
 * — or when every run should hash a trajectory with the same code.
 *
 * **Details**
 *
 * BLAKE3 is the digest the WebAssembly module `blake3-wasm` carries: a bundle is
 * handed the implementation the package states for the browser, which carries no
 * WebAssembly code of its own, so a page provides that code the way the package's
 * own readme says — `blake3/browser` is the entry carrying it; what carries the code
 * itself is the package's Node.js entry, so a program that runs on Node hashes
 * through this layer as it stands.
 *
 * SHA-256 is the digest WebCrypto reads, over the bytes of a whole stream rather
 * than as they arrive, and BLAKE2b is the one algorithm a browser states no codec
 * for: it is the JavaScript hash `@trajs/utils` ships, computed where JavaScript
 * runs. The three digests are of 32 bytes each, so a trajectory is named by the same
 * 64 characters of hex whichever one is stated.
 *
 * The algorithm is the layer's to state ({@link Options}), and defaults to BLAKE3,
 * the digest a trajectory has always been named by.
 *
 * @see {@link StreamHash} for the hash this provides.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<StreamHash> => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;

  return Layer.succeed(StreamHash, { algorithm, digest: digest(algorithm) });
};
