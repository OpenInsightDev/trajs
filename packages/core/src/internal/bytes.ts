/**
 * The fixed-width unsigned integers of the container, unsigned and little-endian.
 *
 * The chunk header, the chunk table and `footerLen` read their fields here, so
 * one module states the byte order.
 */

export const U32Bytes = 4;

/**
 * The `u32` at `offset`, or `undefined` when the bytes end before it.
 */
export const decodeU32 = (bytes: Uint8Array, offset = 0): number | undefined =>
  offset < 0 || offset + U32Bytes > bytes.length
    ? undefined
    : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

/**
 * The bytes of `value`, or `undefined` when the value is not a `u32`.
 *
 * A value the format cannot state is refused rather than written truncated.
 */
export const encodeU32 = (value: number): Uint8Array | undefined => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    return undefined;
  }

  const bytes = new Uint8Array(U32Bytes);

  new DataView(bytes.buffer).setUint32(0, value, true);

  return bytes;
};
