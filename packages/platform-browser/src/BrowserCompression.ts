/**
 * The compression a program computes anywhere with: the zstd frame the WebAssembly
 * codec `@structured-world/structured-zstd` writes and reads one with.
 *
 * {@link layer} is the {@link Compression} this package provides the exchange with,
 * over the codec, which runs where `node:zlib` is not — a page, say. What it writes
 * is the same zstd `node:zlib` writes, so a frame either writes the other reads. The
 * codec is imported with this module, which only a program that depends on this
 * package imports.
 */

import {
  createCompressStream,
  createDecompressStream,
  type CompressStream,
} from "@structured-world/structured-zstd";
import { Compression, CompressionError } from "@trajs/utils/Compression";
import { Effect, Layer, Stream } from "effect";

/** A handle of the WebAssembly codec: what one direction of a frame is written and read through. */
type Codec = Pick<CompressStream, "push" | "finish" | "free">;

/** What the WebAssembly codec refuses a frame for, as the compression that failed. */
const refused = (cause: unknown): CompressionError => new CompressionError({ cause });

/**
 * Carries a stream of chunks through one handle of the codec: every chunk is fed
 * to the handle as the downstream pulls it, whatever the handle has complete is
 * emitted, and the frame is sealed when the chunks end.
 *
 * The handle belongs to the run of the stream it carries, so it is freed when that
 * stream ends — and when a downstream stops reading early, which is when it would
 * otherwise be left to the engine's collector.
 */
const carried = <E, R>(
  open: () => Promise<Codec>,
  bytes: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<Uint8Array, E | CompressionError, R> =>
  Stream.unwrap(
    Effect.acquireRelease(Effect.tryPromise({ try: open, catch: refused }), (handle) =>
      Effect.sync(() => handle.free()),
    ).pipe(
      Effect.map((handle) =>
        bytes.pipe(
          // One frame is one stream the handle keeps across the chunks, so the
          // chunks are fed to it one at a time and in the order they are read.
          Stream.mapEffect(
            (chunk) => Effect.try({ try: () => handle.push(chunk), catch: refused }),
            {
              concurrency: 1,
            },
          ),
          Stream.filter((piece) => piece.length > 0),
          Stream.concat(
            Stream.fromEffect(Effect.try({ try: () => handle.finish(), catch: refused })),
          ),
        ),
      ),
    ),
  );

/**
 * The compression a program computes anywhere with, over the WebAssembly codec
 * `@structured-world/structured-zstd` carries.
 *
 * **When to use**
 *
 * Use when a program runs where `node:zlib` is not — a page, a worker, Deno — or
 * when every run should write and read a recording with the same codec.
 *
 * **Details**
 *
 * The codec's engine picks the SIMD payload where the host has it and the scalar
 * one where it has not; each frame is then carried through one handle of the codec
 * per run, so a recording is written and read as it arrives.
 *
 * What it writes is the same zstd `node:zlib` writes, so a frame either writes the
 * other reads — `@trajs/platform-node`'s compression is the one of a program that
 * runs on Node, where `node:zlib` is there.
 *
 * @see {@link Compression} for the compression this provides.
 * @category layers
 */
export const layer: Layer.Layer<Compression> = Layer.succeed(Compression, {
  compress: (bytes) => carried(() => createCompressStream(), bytes),
  decompress: (bytes) => carried(() => createDecompressStream(), bytes),
});
