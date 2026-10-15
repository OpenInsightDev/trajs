/**
 * The compression a recording's parts are carried in: the zstd frame they are
 * written and read with.
 *
 * What writes and reads that frame is a {@link Compression}, and the exchange is
 * built over one, so how a recording's parts are carried is a layer's to say rather
 * than the format's: nothing of the format changes when another compression is
 * provided. The two layers this module states differ in what they need to run, and
 * neither is loaded unless it is provided — {@link nodeLayer} is over the zstd
 * stream `node:zlib` writes and reads one with, which is read when that layer is
 * provided, and {@link wasmLayer} is over a WebAssembly codec that runs where
 * `node:zlib` is not — a page, say — whose payload is loaded when it first writes
 * or reads a frame. What either writes the other reads, so a recording either
 * carries the other reads back.
 *
 * Nothing here is published: a program carries a recording's parts through the
 * layers `Exchange.nodeLayer` or `Exchange.wasmLayer`.
 */

import type { CompressStream } from "@structured-world/structured-zstd";
import { Context, Effect, Layer, Stream } from "effect";

import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A compression of a recording's parts: the chunks of a stream in, the chunks of
 * the same stream compressed out.
 *
 * **Details**
 *
 * - `compress` takes the chunks of a stream and gives back the chunks of the same
 *   stream compressed, and `decompress` takes the chunks of a compressed one and
 *   gives back the chunks it decompresses to.
 * - Either direction reports what it failed with as {@link TrajectoryError}, since
 *   a frame that cannot be written or read is a recording that failed rather than
 *   a compression that did; a failure of the chunks the stream carries is left to
 *   pass through as the failure it is.
 *
 * @see {@link Compression} for the service the exchange is provided with.
 */
export interface Compression {
  /**
   * Compresses the chunks of a stream into the frame a recording's parts are
   * carried in.
   */
  readonly compress: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | TrajectoryError, R>;

  /**
   * Decompresses the chunks of the frame a recording's parts are carried in.
   */
  readonly decompress: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | TrajectoryError, R>;
}

/**
 * The compression a recording's parts are written and read with: what
 * `yield* Compression` gives carries a stream of chunks through the frame they are
 * carried in.
 *
 * **Details**
 *
 * What writes and reads that frame is the only thing that changes between the
 * programs that keep recordings — what a recording is of is the format's — so the
 * exchange requires this service rather than holding one itself.
 *
 * Each direction carries a stream rather than holding one: one frame is written or
 * read per call, and nothing of it survives the stream it was carried in.
 *
 * @see {@link Compression} for what it carries a stream with.
 */
export const Compression: Context.Service<Compression, Compression> = Context.Service<
  Compression,
  Compression
>()("trajs/core/Compression");

/**
 * The compression a program on Node carries a recording's parts with, over the
 * zstd stream `node:zlib` writes and reads one with.
 *
 * **Details**
 *
 * The stream is `node:zlib`'s, so it is loaded when this layer is provided rather
 * than when this module is imported: a program that never provides it — a page —
 * never reaches for it. What a program that runs where `node:zlib` is not provides
 * instead is {@link wasmLayer}, and a frame either writes the other reads.
 *
 * @see {@link Compression} for the compression this provides.
 */
export const nodeLayer: Layer.Layer<Compression> = Layer.unwrap(
  Effect.promise(() => import("./zstd.ts")).pipe(Effect.map((zstd) => zstd.layer)),
);

/** A handle of the WebAssembly codec: what one direction of a frame is written and read through. */
type Codec = Pick<CompressStream, "push" | "finish" | "free">;

/** What the WebAssembly codec refuses a frame for, as the recording that failed. */
const refused = (cause: unknown): TrajectoryError => TrajectoryError.parse(cause);

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
): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
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
 * **Details**
 *
 * The codec's engine picks the SIMD payload where the host has it and the scalar
 * one where it has not, and the payload is loaded when this layer is provided
 * rather than when this module is imported; each frame is then carried through one
 * handle of the codec per run, so a recording is written and read as it arrives.
 *
 * What it writes is the same zstd `node:zlib` writes, so a frame either writes the
 * other reads — {@link nodeLayer} is the one of a program that runs on Node, where
 * `node:zlib` is there.
 *
 * @see {@link Compression} for the compression this provides.
 */
export const wasmLayer: Layer.Layer<Compression> = Layer.unwrap(
  Effect.promise(() => import("@structured-world/structured-zstd")).pipe(
    Effect.map((codec) =>
      Layer.succeed(Compression, {
        compress: (bytes) => carried(() => codec.createCompressStream(), bytes),
        decompress: (bytes) => carried(() => codec.createDecompressStream(), bytes),
      }),
    ),
  ),
);
