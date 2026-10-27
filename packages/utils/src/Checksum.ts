/**
 * The block checksum of a trajectory's parts: one cheap number over the bytes of
 * one block.
 *
 * A {@link Checksum} tells a block that arrived whole from one that did not, at a
 * cost small enough to read beside every block a trajectory is cut into. A
 * checksum is not a digest: it catches the corruption a torn, misplaced or
 * rewritten block shows, and says nothing against the collision of a sequence
 * chosen to have the same number. What must name its bytes reads a digest
 * ({@link StreamHash}).
 *
 * The algorithm is stated per call ({@link Options}). One algorithm yields one
 * number on every platform, so a checksum read on one platform agrees with the
 * checksum of the same bytes read on another. A platform package reads it with
 * the codec its runtime states, and the tables this package carries read the same
 * number where a runtime states none.
 *
 * @see {@link StreamHash} for the digest of a trajectory's parts.
 * @stability experimental
 */

import { Context, Layer, Schema } from "effect";

import { crc32 } from "#/internal/checksum.ts";

/**
 * The checksum algorithm of a trajectory's blocks.
 *
 * **When to use**
 *
 * Use to state the checksum of one call ({@link Options}), or to read the
 * recorded checksum algorithm of a trajectory.
 *
 * **Details**
 *
 * - `Crc32` (0) is CRC-32, the checksum gzip states (RFC 1952) over the IEEE
 *   802.3 polynomial.
 *
 * `@noble/hashes` states no CRC, so this package carries the tables of the
 * algorithm. `node:zlib` states the same checksum as `zlib.crc32`, and Bun as
 * `Bun.hash.crc32`, so a platform package reads it with a native codec where its
 * runtime has one and the tables of this package read the same number where it
 * does not.
 *
 * Each code is a format contract. A code always names the same checksum, so an
 * old trajectory is checked with its recorded code. A code is only ever added,
 * never moved.
 *
 * @see {@link Options} for the algorithm of one call.
 * @stability experimental
 * @category models
 */
export const Algorithm = Schema.Enum({
  Crc32: 0,
} as const);

export type Algorithm = Schema.Schema.Type<typeof Algorithm>;

/**
 * The checksum option of one call.
 *
 * **When to use**
 *
 * Use to state the algorithm of {@link Checksum.of}.
 *
 * **Details**
 *
 * `algorithm` holds the algorithm ({@link Algorithm}). {@link defaultAlgorithm}
 * applies when `algorithm` is omitted.
 *
 * @see {@link Algorithm} for the available checksums.
 * @stability experimental
 * @category models
 */
export interface Options {
  readonly algorithm?: Algorithm;
}

/**
 * The default algorithm: `Crc32`.
 *
 * **When to use**
 *
 * Use in a checksum to resolve an omitted option ({@link Options}).
 *
 * **Details**
 *
 * It is the only algorithm so far, and the one every platform reads.
 *
 * @see {@link Algorithm} for the code.
 * @stability experimental
 * @category constants
 */
export const defaultAlgorithm: Algorithm = Algorithm.enums.Crc32;

/**
 * The checksum of a trajectory's blocks.
 *
 * **When to use**
 *
 * Use to check a block of bytes as it is read back, before it is decoded, and to
 * state the number a block is written with.
 *
 * **Details**
 *
 * - `of` takes an algorithm ({@link Options}) and returns the function that reads
 *   the checksum of the bytes it is given, as an unsigned 32-bit number.
 * - Each call reads one number over exactly the bytes it is given, so the blocks
 *   of a trajectory are checked one at a time rather than as one sequence.
 *
 * {@link defaultAlgorithm} applies when no algorithm is given. Every platform
 * reads the same number for the same bytes, and no checksum of a layer fails.
 *
 * **Gotchas**
 *
 * A checksum is not a digest. Two different blocks can share one number, so a
 * block is checked for the corruption of a write rather than for its identity.
 *
 * @see {@link Options} for the algorithm of one call.
 * @see {@link StreamHash} for the digest that names a trajectory.
 * @stability experimental
 * @category services
 */
export interface Checksum {
  /**
   * The checksum of the bytes given to it, read once they have arrived.
   */
  readonly of: (options?: Options) => (bytes: Uint8Array) => number;
}

/**
 * The block checksum of a trajectory.
 *
 * **When to use**
 *
 * Use to require a checksum. Provide {@link layer}, or the layer of a platform
 * package where it provides one.
 *
 * **Details**
 *
 * Each call reads one number and keeps nothing between calls. State the algorithm
 * per call ({@link Options}).
 *
 * @see {@link Checksum} for the operation.
 * @stability experimental
 * @category tags
 */
export const Checksum: Context.Service<Checksum, Checksum> = Context.Service<Checksum, Checksum>()(
  "trajs/utils/Checksum",
);

const reading = (algorithm: Algorithm): ((bytes: Uint8Array) => number) => {
  switch (algorithm) {
    case Algorithm.enums.Crc32:
      return crc32;
  }
};

/**
 * The checksum of this package as a service.
 *
 * **When to use**
 *
 * Use to state the checksum of this package instead of one a platform package
 * reads, or to provide the service without a layer.
 *
 * **Details**
 *
 * {@link layer} provides this value. A `Checksum` from here and one from the
 * layer read the same number. {@link defaultAlgorithm} applies to a call without
 * an algorithm.
 *
 * @see {@link layer} for the same checksum as a layer.
 * @stability experimental
 * @category constructors
 */
export const make = (): Checksum => ({
  of: (options) => reading(options?.algorithm ?? defaultAlgorithm),
});

/**
 * The checksum of this package: CRC-32, read from the tables it carries.
 *
 * **When to use**
 *
 * Use to check a block of a trajectory without a platform package, such as in a
 * page, a worker or a script, or where the runtime states no CRC of its own. Use
 * it as well when every run should read the same number with the same code, since
 * it needs no native call.
 *
 * **Details**
 *
 * A block is checked eight bytes at a time through the tables of the algorithm,
 * so the number costs little beside the compression of the block it checks.
 *
 * @see {@link Checksum} for the service of this checksum.
 * @see {@link make} for the same checksum as a service.
 * @stability experimental
 * @category layers
 */
export const layer: Layer.Layer<Checksum> = Layer.succeed(Checksum, make());
