/**
 * The codecs and the hash Bun states, declared as much of them as this package
 * reaches for.
 *
 * Bun puts its APIs on the `bun` module, and a program that runs on Bun states them
 * with `bun-types`; declaring the functions a compression and a checksum use here
 * keeps this package to what it reads rather than depending on the whole of them.
 */
declare module "bun" {
  export function deflateSync(data: Uint8Array): Uint8Array;

  export function gunzipSync(data: Uint8Array): Uint8Array;

  export function gzipSync(data: Uint8Array): Uint8Array;

  export const hash: {
    crc32(data: Uint8Array): number;
  };

  export function inflateSync(data: Uint8Array): Uint8Array;

  export function zstdCompress(
    data: Uint8Array,
    options?: { readonly level: number },
  ): Promise<Uint8Array>;

  export function zstdDecompress(data: Uint8Array): Promise<Uint8Array>;
}
