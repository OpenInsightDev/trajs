/**
 * The frame a recording's parts are carried in, as Bun writes and reads one: a
 * zstd, gzip or deflate frame, or the bytes as they are.
 *
 * {@link layer} is the {@link Compression} this package provides the exchange with,
 * over `Bun.zstdCompress` and `Bun.zstdDecompress` for zstd, and over Bun's own
 * `gzipSync`, `gunzipSync`, `deflateSync` and `inflateSync` for gzip and deflate.
 * What it writes is the same frame `node:zlib` and the WebAssembly codec write, so a
 * frame either writes the others read.
 */

import {
  Compression,
  CompressionError,
  defaultAlgorithm,
  type Algorithm,
  type Options,
} from "@trajs/utils/Compression";
import { deflateSync, gunzipSync, gzipSync, inflateSync, zstdCompress, zstdDecompress } from "bun";
import { Effect, Layer, Stream } from "effect";

/**
 * The algorithms Bun states a codec for: every one the compression states but the
 * bytes carried as they are, which no codec is needed for.
 */
type BunAlgorithm = Exclude<Algorithm, "none">;

const compressors: Record<BunAlgorithm, (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>> = {
  deflate: deflateSync,
  gzip: gzipSync,
  zstd: zstdCompress,
};

const decompressors: Record<BunAlgorithm, (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>> =
  {
    deflate: inflateSync,
    gzip: gunzipSync,
    zstd: zstdDecompress,
  };

/** What Bun refuses a frame for, as the compression that failed. */
const refused = (cause: unknown): CompressionError => new CompressionError({ cause });

/** The bytes of a stream held whole, as the one buffer Bun compresses or decompresses at once. */
const held = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

/**
 * Carries a stream of chunks through one call of a Bun codec: the chunks are held
 * whole, handed to `whole` at once, and what it gives back is emitted as one chunk.
 *
 * Bun states its codecs as whole-buffer operations rather than streams — the zstd
 * pair as a promise, the other four as calls that return at once — so a recording's
 * parts are held while it is written or read rather than carried as they arrive.
 */
const carried = <E, R>(
  whole: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>,
  bytes: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<Uint8Array, E | CompressionError, R> =>
  Stream.fromEffect(
    bytes.pipe(
      Stream.runCollect,
      Effect.flatMap((chunks) =>
        // A codec that returns at once throws where it refuses a frame, so what it
        // writes is taken as a promise either way.
        Effect.tryPromise({ try: async () => whole(held(chunks)), catch: refused }),
      ),
    ),
  );

/**
 * The compression a program on Bun carries a recording's parts with: the codecs Bun
 * states itself.
 *
 * **When to use**
 *
 * Use when a program runs on Bun, where `Bun.zstdCompress` and the rest of Bun's
 * codecs are there: it states every algorithm the browser's compression states and
 * zstd beside them.
 *
 * **Details**
 *
 * What it writes for an algorithm is what the other platform packages write for the
 * same one — the gzip and deflate a browser states itself, and the zstd `node:zlib`
 * writes — so a recording one wrote is a recording the others load. `none` carries
 * the parts as the format encodes them, which is the frame that costs nothing to
 * write and the most to keep.
 *
 * The algorithm is the layer's to state ({@link Options}), and defaults to zstd, the
 * frame a recording has always been carried in.
 *
 * Bun states its codecs as whole-buffer operations rather than streams, so a
 * recording's parts are held while the frame is written or read — which is what this
 * layer costs over the streaming compressions the other platform packages state.
 *
 * @see {@link Compression} for the compression this provides.
 * @category layers
 */
export const layer = (options?: Options): Layer.Layer<Compression> => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;

  return Layer.succeed(Compression, {
    compress: (bytes) => (algorithm === "none" ? bytes : carried(compressors[algorithm], bytes)),
    decompress: (bytes) =>
      algorithm === "none" ? bytes : carried(decompressors[algorithm], bytes),
  });
};
