/**
 * Reads the pixel size of an image out of the payload a part carries.
 *
 * A vision model charges for an image by its pixels, so an estimate that is not a
 * placeholder starts from the image's width and height. A part carries the image
 * itself — its bytes, or a base64 string such as a `data:` URL — and every format
 * these models read states the size in a header, so the size is read from those
 * bytes rather than by decoding the image.
 *
 * A payload that is only a URL somewhere else, or a format nothing here knows,
 * has no size in it: reading it would mean fetching it, which counting does not
 * do, so the caller's rule decides what to charge instead.
 */

import { Predicate, Result } from "effect";
import { Base64 } from "effect/encoding";

/** The size of an image, in pixels. */
export interface ImageSize {
  /** Width of the image. */
  readonly width: number;
  /** Height of the image. */
  readonly height: number;
}

/** Bytes that begin a PNG file. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Frame headers a JPEG states its size in. */
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Bytes a payload needs before any of the formats below can state a size. */
const SHORTEST_HEADER = 10;

const readUint16Be = (bytes: Uint8Array, at: number): number => (bytes[at] << 8) | bytes[at + 1];

const readUint16Le = (bytes: Uint8Array, at: number): number => bytes[at] | (bytes[at + 1] << 8);

const readUint32Be = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

const readUint32Le = (bytes: Uint8Array, at: number): number =>
  (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

const readUint24Le = (bytes: Uint8Array, at: number): number =>
  bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);

/** Reads `length` bytes at `at` as ASCII, which is what every four-character tag is. */
const readAscii = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(at, at + length));

/** The size a PNG states in its `IHDR` chunk. */
const pngSize = (bytes: Uint8Array): ImageSize | undefined => {
  if (bytes.length < 24) return undefined;

  if (!PNG_SIGNATURE.every((byte, at) => bytes[at] === byte)) return undefined;

  return { width: readUint32Be(bytes, 16), height: readUint32Be(bytes, 20) };
};

/** The size a GIF states in its logical screen descriptor. */
const gifSize = (bytes: Uint8Array): ImageSize | undefined => {
  if (bytes.length < SHORTEST_HEADER) return undefined;

  if (readAscii(bytes, 0, 3) !== "GIF") return undefined;

  return { width: readUint16Le(bytes, 6), height: readUint16Le(bytes, 8) };
};

/**
 * The size a JPEG states in its frame header.
 *
 * A JPEG is a line of segments, each marked by `FF` and a kind; the frame header is
 * the first segment that carries the image's size, and the segments before it
 * carry only metadata, so they are stepped over by their own length.
 */
const jpegSize = (bytes: Uint8Array): ImageSize | undefined => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;

  let at = 2;

  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) return undefined;

    const marker = bytes[at + 1];

    // A marker may be padded with `FF`, and a restart or boundary marker carries no
    // length of its own.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += marker === 0xff ? 1 : 2;

      continue;
    }

    const length = readUint16Be(bytes, at + 2);

    if (JPEG_FRAME_MARKERS.has(marker)) {
      return { width: readUint16Be(bytes, at + 7), height: readUint16Be(bytes, at + 5) };
    }

    // The scan follows the last header, so there is no frame header to find.
    if (marker === 0xda || length < 2) return undefined;

    at += 2 + length;
  }

  return undefined;
};

/** The size a WebP states in the header of its image chunk. */
const webpSize = (bytes: Uint8Array): ImageSize | undefined => {
  if (bytes.length < 25) return undefined;

  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WEBP") return undefined;

  const chunk = readAscii(bytes, 12, 4);

  // The lossless chunk packs both sizes, each one short of its value, into 32 bits.
  if (chunk === "VP8L") {
    const sizes = readUint32Le(bytes, 21);

    return { width: (sizes & 0x3fff) + 1, height: ((sizes >> 14) & 0x3fff) + 1 };
  }

  if (bytes.length < 30) return undefined;

  // The extended chunk states the canvas behind its flags and reserved bytes.
  if (chunk === "VP8X") {
    return { width: readUint24Le(bytes, 24) + 1, height: readUint24Le(bytes, 27) + 1 };
  }

  // The lossy chunk states them behind the frame tag and its start code.
  if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return undefined;

    return {
      width: readUint16Le(bytes, 26) & 0x3fff,
      height: readUint16Le(bytes, 28) & 0x3fff,
    };
  }

  return undefined;
};

/** Decodes base64, which is how a payload carries bytes when it carries text. */
const decodeBase64 = (text: string): Uint8Array | undefined => {
  const decoded = Base64.decode(text);

  return Result.isSuccess(decoded) ? decoded.success : undefined;
};

/** The bytes a text payload carries: a `data:` URL's payload, or base64 itself. */
const bytesOfText = (text: string): Uint8Array | undefined => {
  if (!text.startsWith("data:")) return decodeBase64(text);

  const separator = text.indexOf(",");

  if (separator === -1 || !text.slice(0, separator).endsWith(";base64")) {
    return undefined;
  }

  return decodeBase64(text.slice(separator + 1));
};

/** The bytes a payload carries, or nothing when it points somewhere else. */
const bytesOf = (data: string | Uint8Array | URL): Uint8Array | undefined => {
  if (Predicate.isString(data)) return bytesOfText(data);

  if (data instanceof URL) return undefined;

  return data;
};

/**
 * Reads the pixel size of an image payload.
 *
 * The formats are the four a vision model accepts — PNG, JPEG, GIF and WebP — and
 * the size is read from each one's header, so a payload is never decoded.
 */
export const imageSize = (data: string | Uint8Array | URL): ImageSize | undefined => {
  const bytes = bytesOf(data);

  if (bytes === undefined) return undefined;

  return pngSize(bytes) ?? gifSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
};
