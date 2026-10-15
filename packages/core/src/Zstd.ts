/**
 * The zstd stream a recording's parts are carried in, as `node:zlib` writes and
 * reads one.
 *
 * {@link compression} is the {@link Exchange.Compression} a program with
 * `node:zlib` builds {@link Exchange.layer} over: the format is
 * {@link Exchange.layer}'s, and what compresses the frame it carries the parts in
 * is this. A program without `node:zlib` — a page, say — states a
 * {@link Exchange.Compression} of its own instead; the format it reads and writes
 * is the same one.
 */

import type { ZstdOptions } from "node:zlib";

import { Stream } from "effect";

import type { Compression } from "#/Exchange.ts";
import { compress, decompress, type CompressFailed } from "#/internal/zstd.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The zstd stream refusing the bytes it was given, as the recording that failed.
 *
 * What the zstd stream refuses is part of the recording — the bytes of a frame are
 * the format's — so it fails as a {@link TrajectoryError} like any other part of
 * the format does, rather than as a failure of the compression that a program
 * reading the recording would have to know about.
 */
const refused = <E, R>(
  bytes: Stream.Stream<Uint8Array, E | CompressFailed, R>,
): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
  bytes.pipe(
    Stream.catchTag("CompressFailed", (cause) => Stream.fail(TrajectoryError.parse(cause))),
  );

/**
 * The compression the format this package ships is carried in, over `node:zlib`.
 *
 * **When to use**
 *
 * Use to build {@link Exchange.layer} in a program that runs on Node, or to set
 * how the parts of a recording are compressed there.
 *
 * **Details**
 *
 * `options` is taken straight as `node:zlib` takes it, defaulting to what zstd
 * does; its level is the setting to reach for, since the levels around the default
 * 3 trade size for time either way. An option `node:zlib` refuses is a defect of
 * the call rather than a failure of the exchange.
 *
 * **Example** (Building the layer this package ships)
 *
 * ```ts import.meta.vitest
 * import { Exchange } from "@trajs/core"
 * import { compression } from "@trajs/core/Zstd"
 *
 * const layer = Exchange.layer(compression())
 * ```
 *
 * @see {@link Exchange.Compression} for what a layer is built over.
 * @category constructors
 */
export const compression = (options?: ZstdOptions): Compression => ({
  compress: (bytes) => refused(compress(options)(bytes)),
  decompress: (bytes) => refused(decompress(bytes)),
});
