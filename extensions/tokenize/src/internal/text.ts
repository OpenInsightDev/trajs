/**
 * The text and byte primitives a tokenizer converts between.
 *
 * Encoding turns text into UTF-8 bytes and decoding turns bytes back, so the
 * encoder and decoder are shared here once, and the UTF-8 check decides whether
 * a byte slice may be looked up in the rank table of the text it would decode to.
 */

const textEncoder = new TextEncoder();

const textDecoder = new TextDecoder("utf-8");

/** Encodes text as UTF-8 bytes. */
export const encodeUtf8 = (text: string): Uint8Array => textEncoder.encode(text);

/** Decodes UTF-8 bytes as text. */
export const decodeUtf8 = (bytes: Uint8Array): string => textDecoder.decode(bytes);

/** Escapes a literal so it matches itself inside a regular expression. */
export const escapeRegex = (text: string): string => text.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");

/**
 * Returns whether bytes are a complete, well-formed UTF-8 sequence.
 *
 * `TextDecoder` replaces malformed bytes with U+FFFD instead of failing, so a
 * byte slice must be checked here before it may stand for text; the check reads
 * the continuation bytes itself rather than paying for a decoding round trip.
 */
export const isValidUtf8 = (bytes: Uint8Array): boolean => {
  let at = 0;

  while (at < bytes.length) {
    const leading = bytes[at];
    let width = 0;
    let codePoint = 0;

    if (leading <= 0x7f) {
      width = 1;
      codePoint = leading;
    } else if ((leading & 0xe0) === 0xc0) {
      if (leading <= 0xc1) return false; // Overlong encoding.

      width = 2;
      codePoint = leading & 0x1f;
    } else if ((leading & 0xf0) === 0xe0) {
      width = 3;
      codePoint = leading & 0x0f;
    } else if ((leading & 0xf8) === 0xf0) {
      if (leading > 0xf4) return false; // Above U+10FFFF.

      width = 4;
      codePoint = leading & 0x07;
    } else {
      return false;
    }

    if (at + width > bytes.length) return false;

    for (let offset = 1; offset < width; offset++) {
      const continuation = bytes[at + offset];

      if ((continuation & 0xc0) !== 0x80) return false;

      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }

    if (width === 2 && codePoint < 0x80) return false;

    if (width === 3 && codePoint < 0x800) return false;

    if (width === 4 && codePoint < 0x10000) return false;

    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false;

    if (codePoint > 0x10ffff) return false;

    at += width;
  }

  return true;
};

/** Decodes bytes as text, or returns `undefined` when they are not UTF-8. */
export const tryBytesToText = (bytes: Uint8Array): string | undefined =>
  isValidUtf8(bytes) ? decodeUtf8(bytes) : undefined;
