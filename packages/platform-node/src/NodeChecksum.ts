/**
 * The block checksum of a trajectory's parts on Node: CRC-32, read by
 * `node:zlib`.
 *
 * {@link layer} provides the {@link Checksum} of this package. `zlib.crc32` states
 * the checksum gzip states, so a number read here agrees with one read by the
 * tables of `@trajs/utils` and by `@trajs/platform-bun`.
 *
 * @stability experimental
 */

import * as zlib from "node:zlib";

import { Algorithm, Checksum, defaultAlgorithm, type Options, make } from "@trajs/utils/Checksum";
import { Layer } from "effect";

/**
 * The CRC-32 of `node:zlib`, where the runtime states one.
 *
 * It landed in Node 22.2, so a runtime older than that reads the checksum through
 * the tables of `@trajs/utils` rather than failing.
 */
const native: ((bytes: Uint8Array) => number) | undefined = zlib.crc32;

/** The checksum of the tables this package ships, for what a runtime does not read. */
const portable = make();

/**
 * Reads the checksum of a block with `node:zlib`.
 *
 * **When to use**
 *
 * Use to check a block of bytes on Node without going through the service, or to
 * state the checksum of one algorithm where the service is not at hand.
 *
 * **Details**
 *
 * `zlib.crc32` reads CRC-32, so it reads one number for a block, and the tables of
 * `@trajs/utils` read the same number where the runtime states no `crc32`. Every
 * other checksum comes from those tables as well.
 *
 * @see {@link layer} for the same checksum as a layer.
 * @see {@link Options} for the algorithm it reads with.
 * @stability experimental
 * @category combinators
 */
export const of = (options?: Options): ((bytes: Uint8Array) => number) => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;
  const codec = algorithm === Algorithm.enums.Crc32 ? native : undefined;
  const reading = portable.of({ algorithm });

  return codec === undefined ? reading : (bytes) => codec(bytes);
};

/**
 * The checksum of a Node program: CRC-32 read by `node:zlib`.
 *
 * **When to use**
 *
 * Use in a Node program, where the checksum of a block is read beside the
 * compression of the block it checks.
 *
 * **Details**
 *
 * `zlib.crc32` is a native call, so a block is checked faster than through the
 * tables of `@trajs/utils`, and it reads the same number, so a trajectory checked
 * on Node is checked by a page as well.
 *
 * An omitted algorithm means CRC-32 ({@link defaultAlgorithm}). A runtime without
 * `zlib.crc32` reads the checksum through those tables.
 *
 * @see {@link Checksum} for the provided service.
 * @stability experimental
 * @category layers
 */
export const layer: Layer.Layer<Checksum> = Layer.succeed(Checksum, { of });
