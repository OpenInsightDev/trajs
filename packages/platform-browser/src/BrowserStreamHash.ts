/**
 * The digest of a trajectory's parts in a browser: `blake3-wasm`, WebCrypto and
 * `@trajs/utils`.
 *
 * {@link layer} provides the {@link StreamHash} of this package. One algorithm
 * yields the same digest as every other platform package. This module imports the
 * codecs, so only a package with a dependency on it loads them.
 *
 * @stability stable
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

/** The sink of one digest: bytes in, a hex digest out. */
type Hashing = Sink.Sink<string, Uint8Array, never, never>;

/** What SHA-256 is asked of WebCrypto as. */
const Sha256 = "SHA-256";

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

/** The digest of bytes as lowercase hex. */
const hex = (bytes: Uint8Array): string => {
  let text = "";

  for (const byte of bytes) {
    text += byte.toString(16).padStart(2, "0");
  }

  return text;
};

/**
 * The SHA-256 sink: the chunks are kept and digested in one WebCrypto call.
 *
 * WebCrypto needs a secure context, so a page over plain HTTP has no SHA-256.
 * BLAKE2b and BLAKE3 need no page context. A refused digest is a defect, because
 * no hash of a layer fails.
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
 * The BLAKE3 sink of the WebAssembly module `blake3-wasm`.
 *
 * Reading the digest spends the hash, because the WebAssembly hasher frees itself
 * then. A run therefore builds its own hash.
 */
const webAssembly: Hashing = Sink.reduce(
  () => blake3.createHash(),
  (hashed, chunk: Uint8Array) => {
    hashed.update(chunk);

    return hashed;
  },
).pipe(Sink.map((hashed) => hashed.digest("hex")));

/** The sink of one algorithm. */
const hashing = (algorithm: Algorithm): Hashing => {
  switch (algorithm) {
    case Algorithm.enums.Blake2b:
      return hashInJavaScript().digest({ algorithm });
    case Algorithm.enums.Sha256:
      return webCrypto;
    default:
      return webAssembly;
  }
};

/**
 * The hash of a browser: the browser codecs and the JavaScript hash of
 * `@trajs/utils`.
 *
 * **When to use**
 *
 * Use in a page or a worker, where a native addon is not available. Use it as well
 * when every run should hash with the same code.
 *
 * **Details**
 *
 * Every algorithm is available, and each call states its own ({@link Options}).
 * An omitted algorithm means BLAKE3, the historical digest.
 *
 * BLAKE3 comes from the WebAssembly module `blake3-wasm`. A bundle takes the
 * browser entry of the package, so a page supplies the WebAssembly code through
 * `blake3/browser`.
 *
 * SHA-256 comes from WebCrypto, with one call over the whole stream. BLAKE2b has
 * no browser codec, so it uses the JavaScript hash of `@trajs/utils`.
 *
 * Every digest has 32 bytes, or 64 hex characters.
 *
 * @see {@link StreamHash} for the provided service.
 * @stability stable
 * @category layers
 */
export const layer: Layer.Layer<StreamHash> = Layer.succeed(StreamHash, {
  digest: (options?: Options) => hashing(options?.algorithm ?? defaultAlgorithm),
});
