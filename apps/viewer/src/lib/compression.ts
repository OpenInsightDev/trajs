/**
 * How a page reads the zstd stream a recording's parts are carried in.
 *
 * `@trajs/core` builds its exchange over `node:zlib` (`@trajs/core/Zstd`), which
 * a page has no access to, and the one thing a page would otherwise reach for —
 * `DecompressionStream` — carries no zstd. So the compression is stated here, out
 * of `fzstd`: the format is the package's, and what decompresses its frame is the
 * viewer's, which is what `Exchange.Compression` is for.
 *
 * `fzstd` is a decoder alone, so this is a compression a page can read a recording
 * with and not write one with: `compress` fails rather than writing a frame
 * nothing would read back, and only a reader ever asks for it.
 */

import type { Compression } from "@trajs/core/Exchange";
import { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect, Stream } from "effect";
import { Decompress } from "fzstd";

const joined = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));

  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }

  return bytes;
};

/**
 * One recording's frame, decompressed. The body of a recording is one frame and
 * a page reads a file whole, so the frame is read in one piece rather than a
 * chunk at a time; decompressing a frame that was cut short fails, as it should.
 */
const decompressFrame = (frame: Uint8Array): Uint8Array => {
  const written: Array<Uint8Array> = [];

  const stream = new Decompress((chunk) => {
    written.push(chunk);
  });

  stream.push(frame, true);

  return joined(written);
};

export const compression: Compression = {
  decompress: (bytes) =>
    Stream.unwrap(
      Stream.runCollect(bytes).pipe(
        Effect.flatMap((chunks) =>
          Effect.try({
            try: () => decompressFrame(joined(Array.from(chunks))),
            catch: (cause) => TrajectoryError.parse(cause),
          }),
        ),
        Effect.map((decompressed) => Stream.fromIterable([decompressed])),
      ),
    ),

  compress: () =>
    Stream.fail(
      TrajectoryError.parse(
        "a page has no zstd compressor, so a recording can be read here but not written",
      ),
    ),
};
