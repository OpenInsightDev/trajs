/**
 * The zstd Bun states, declared as much of it as this package reaches for.
 *
 * Bun puts its APIs on the `bun` module, and a program that runs on Bun states them
 * with `bun-types`; declaring the two functions a compression uses here keeps this
 * package to what it reads rather than depending on the whole of them.
 */
declare module "bun" {
  export function zstdCompress(
    data: Uint8Array,
    options?: { readonly level: number },
  ): Promise<Uint8Array>;

  export function zstdDecompress(data: Uint8Array): Promise<Uint8Array>;
}
