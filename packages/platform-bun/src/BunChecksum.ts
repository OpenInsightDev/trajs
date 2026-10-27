/**
 * The block checksum of a trajectory's parts on Bun: CRC-32, read by
 * `Bun.hash.crc32`.
 *
 * {@link layer} provides the {@link Checksum} of this package. `Bun.hash.crc32`
 * states the checksum gzip states, so a number read here agrees with one read by
 * `node:zlib` and by the tables of `@trajs/utils`.
 *
 * @stability experimental
 */

import { Algorithm, Checksum, defaultAlgorithm, type Options, make } from "@trajs/utils/Checksum";
import { hash } from "bun";
import { Layer } from "effect";

/** The checksum of the tables this package ships, for what a runtime does not read. */
const portable = make();

/**
 * Reads the checksum of a block with `Bun.hash.crc32`.
 *
 * **When to use**
 *
 * Use to check a block of bytes on Bun without going through the service, or to
 * state the checksum of one algorithm where the service is not at hand.
 *
 * **Details**
 *
 * `Bun.hash.crc32` reads CRC-32, so it reads one number for a block, and the
 * tables of `@trajs/utils` read the same number where the runtime states no
 * `hash.crc32`. Every other checksum comes from those tables as well.
 *
 * @see {@link layer} for the same checksum as a layer.
 * @see {@link Options} for the algorithm it reads with.
 * @stability experimental
 * @category combinators
 */
export const of = (options?: Options): ((bytes: Uint8Array) => number) => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;

  // `hash.crc32` is a method of `Bun.hash`, so it is called through the object
  // rather than held as a function of its own. A runtime without it reads the
  // checksum through the tables of `@trajs/utils` rather than failing.
  if (algorithm === Algorithm.enums.Crc32 && hash.crc32 !== undefined) {
    return (bytes) => hash.crc32(bytes);
  }

  return portable.of({ algorithm });
};

/**
 * The checksum of a Bun program: CRC-32 read by `Bun.hash.crc32`.
 *
 * **When to use**
 *
 * Use in a Bun program, where the checksum of a block is read beside the
 * compression of the block it checks.
 *
 * **Details**
 *
 * `Bun.hash.crc32` is a native call, so a block is checked faster than through the
 * tables of `@trajs/utils`, and it reads the same number, so a trajectory checked
 * on Bun is checked by a page as well.
 *
 * An omitted algorithm means CRC-32 ({@link defaultAlgorithm}). A runtime without
 * `hash.crc32` reads the checksum through those tables.
 *
 * @see {@link Checksum} for the provided service.
 * @stability experimental
 * @category layers
 */
export const layer: Layer.Layer<Checksum> = Layer.succeed(Checksum, { of });
