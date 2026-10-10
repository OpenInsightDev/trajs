/**
 * Image payloads for the tests.
 *
 * Reading a size is reading a header, so the payloads below are the header of
 * each format and nothing else, built to state the size the test asks for. The
 * one exception is `describedPng`, which is a real one-pixel PNG.
 */

/** The bytes the parts spell, in order. */
const bytes = (...parts: ReadonlyArray<ReadonlyArray<number>>): Uint8Array =>
  Uint8Array.from(parts.flat());

/** A 32-bit integer, most significant byte first, which is how PNG states a size. */
const bigEndian32 = (value: number): ReadonlyArray<number> => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

/** A 16-bit integer, least significant byte first, which is how GIF and WebP state one. */
const littleEndian16 = (value: number): ReadonlyArray<number> => [
  value & 0xff,
  (value >> 8) & 0xff,
];

/** A 32-bit integer, least significant byte first. */
const littleEndian32 = (value: number): ReadonlyArray<number> => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];

/** Bytes of a PNG stating `width` by `height`: its signature and `IHDR` chunk. */
export const png = (width: number, height: number): Uint8Array =>
  bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // signature
    [0x00, 0x00, 0x00, 0x0d], // length of the chunk that follows
    [0x49, 0x48, 0x44, 0x52], // "IHDR"
    bigEndian32(width),
    bigEndian32(height),
    [0x08, 0x06, 0x00, 0x00, 0x00], // depth, colour, deflate, filter, interlace
  );

/** Bytes of a GIF stating `width` by `height`: its logical screen descriptor. */
export const gif = (width: number, height: number): Uint8Array =>
  bytes(
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // "GIF89a"
    littleEndian16(width),
    littleEndian16(height),
    [0x00, 0x00, 0x00], // packed, background, aspect ratio
    [0x3b], // trailer
  );

/** Bytes of a JPEG stating `width` by `height`: its frame header and nothing else. */
export const jpeg = (width: number, height: number): Uint8Array =>
  bytes(
    [0xff, 0xd8], // start of image
    [0xff, 0xc0, 0x00, 0x11, 0x08], // frame header, its length, and the depth
    [(height >> 8) & 0xff, height & 0xff], // the size is stated height first,
    [(width >> 8) & 0xff, width & 0xff], // most significant byte first
    [0x03], // three components, one per channel
    [0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01],
    [0xff, 0xd9], // end of image
  );

/**
 * Bytes of a lossless WebP stating `width` by `height`.
 *
 * The two sizes share 32 bits, each one short of its value: the width in the low
 * 14 bits, the height in the next 14.
 */
export const webpLossless = (width: number, height: number): Uint8Array => {
  const sizes = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);

  return bytes(
    [0x52, 0x49, 0x46, 0x46], // "RIFF"
    [0x00, 0x00, 0x00, 0x00], // size of the file
    [0x57, 0x45, 0x42, 0x50], // "WEBP"
    [0x56, 0x50, 0x38, 0x4c], // "VP8L"
    [0x04, 0x00, 0x00, 0x00], // size of the chunk
    [0x2f], // signature of a lossless image
    littleEndian32(sizes),
  );
};

/**
 * Bytes of a real PNG, one pixel by one pixel, as a model's documentation sends it.
 */
export const describedPng = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  ),
  (character) => character.charCodeAt(0),
);
