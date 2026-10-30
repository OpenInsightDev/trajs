/**
 * The CRC-32 of a byte sequence, read from tables a slice at a time, and the
 * checksum of one call as `Checksum.make` derives it from the codec of a
 * platform.
 *
 * `@noble/hashes` states no CRC, so this package carries the tables of the
 * algorithm. A slice covers eight bytes rather than one, so a block is checked
 * at a cost small enough to read it beside every block.
 */

import { Algorithm, type Codec, type Options, defaultAlgorithm } from "#/Checksum.ts";

/**
 * The polynomial of CRC-32, 0x04c11db7, reflected.
 *
 * The checksum shifts right, so it reads the polynomial reflected with it: bit 0
 * stands for the highest bit of the polynomial. It is the polynomial gzip states
 * (RFC 1952), so the number agrees with `node:zlib` and `Bun.hash.crc32`.
 */
const Polynomial = 0xedb88320;

/** The bytes one step of the checksum reads, and so the tables it holds. */
const Slices = 8;

/** The bytes of the word one step starts from. */
const Word = 4;

/**
 * The tables of the checksum: for each slice, what a byte of it contributes, and
 * what the byte after it shifts in.
 */
const tables = ((): Uint32Array => {
  const built = new Uint32Array(Slices * 256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ Polynomial : crc >>> 1;
    }

    built[index] = crc >>> 0;
  }

  // A slice holds the byte of the slice before it, taken through the first table,
  // so one table reads eight bytes of a word at once.
  for (let slice = 1; slice < Slices; slice += 1) {
    for (let index = 0; index < 256; index += 1) {
      const before = built[(slice - 1) * 256 + index];

      built[slice * 256 + index] = ((before >>> 8) ^ built[before & 0xff]) >>> 0;
    }
  }

  return built;
})();

/**
 * The CRC-32 of `bytes`, as an unsigned 32-bit number.
 *
 * The checksum of no bytes is 0, and the checksum of `"123456789"` is
 * 0xcbf43926, as RFC 1952 states it.
 */
export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  let at = 0;

  for (; at + Slices <= bytes.length; at += Slices) {
    const word =
      crc ^ (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24));

    crc =
      tables[7 * 256 + (word & 0xff)] ^
      tables[6 * 256 + ((word >>> 8) & 0xff)] ^
      tables[5 * 256 + ((word >>> 16) & 0xff)] ^
      tables[4 * 256 + (word >>> 24)] ^
      tables[3 * 256 + bytes[at + Word]] ^
      tables[2 * 256 + bytes[at + Word + 1]] ^
      tables[1 * 256 + bytes[at + Word + 2]] ^
      tables[bytes[at + Word + 3]];
  }

  for (; at < bytes.length; at += 1) {
    crc = tables[(crc ^ bytes[at]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

/** The checksum of each algorithm, read from the tables this package carries. */
const portable = (algorithm: Algorithm): ((bytes: Uint8Array) => number) => {
  switch (algorithm) {
    case Algorithm.enums.Crc32:
      return crc32;
  }
};

/**
 * The checksum of one call, as `Checksum.make` derives it from the codec of a
 * platform.
 */
export const ofFrom = (
  codec: Codec | undefined,
  options?: Options,
): ((bytes: Uint8Array) => number) => {
  const algorithm = options?.algorithm ?? defaultAlgorithm;

  return codec?.of(algorithm) ?? portable(algorithm);
};
