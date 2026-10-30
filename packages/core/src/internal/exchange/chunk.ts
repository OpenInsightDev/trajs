import { Compression } from "@trajs/utils";
import { Schema } from "effect";

import { decodeU32, U32Bytes } from "#/internal/bytes.ts";
import { ChainBytes } from "#/internal/schema.ts";

// Four `u32`s, one compression code, then the regions and the chain value.
export interface ChunkHeader {
  readonly metaCrc: number;
  readonly bodyCrc: number;
  readonly bodyLen: number;
  readonly metaLen: number;
  readonly compression: Compression.Algorithm;
}

export const ChunkHeaderBytes = 4 * U32Bytes + 1;

// The least a chunk takes: its header and the chain value that ends it.
export const ChunkOverheadBytes = ChunkHeaderBytes + ChainBytes;

// A chunk states its own extent, so a scan reads it before trusting its lengths.
export const chunkLen = (header: ChunkHeader): number =>
  ChunkOverheadBytes + header.metaLen + header.bodyLen;

// One chunk as it is stored: the header that states its extent, the bytes its
// `metaCrc` covers, the meta region, the body region its codec still wraps, and
// the chain value that extends the one before it. `bodyCrc` covers the body
// region alone.
export interface Chunk {
  readonly header: ChunkHeader;
  readonly metaCovered: Uint8Array;
  readonly meta: Uint8Array;
  readonly body: Uint8Array;
  readonly chain: Uint8Array;
}

const isCompression = Schema.is(Compression.Algorithm);

// The header's fields, in the order the chunk stores them, or `undefined` when the
// bytes end before them or state a code this format names no codec for.
const headerOf = (bytes: Uint8Array): ChunkHeader | undefined => {
  if (bytes.length < ChunkHeaderBytes) {
    return undefined;
  }

  const compression = bytes.at(ChunkHeaderBytes - 1);

  if (compression === undefined || !isCompression(compression)) {
    return undefined;
  }

  // The bytes hold a header, so each `u32` of it reads.
  return {
    metaCrc: decodeU32(bytes, 0)!,
    bodyCrc: decodeU32(bytes, U32Bytes)!,
    bodyLen: decodeU32(bytes, 2 * U32Bytes)!,
    metaLen: decodeU32(bytes, 3 * U32Bytes)!,
    compression,
  };
};

// One chunk and the bytes after it, or `undefined` when they hold none that this
// format states: a header that does not fit or names no codec, or an extent that
// runs past their end. The last is a writer that stopped inside a write.
export const chunkOf = (
  bytes: Uint8Array,
): { readonly chunk: Chunk; readonly rest: Uint8Array } | undefined => {
  const header = headerOf(bytes);

  if (header === undefined) {
    return undefined;
  }

  const len = chunkLen(header);

  if (len > bytes.length) {
    return undefined;
  }

  // The meta region follows the header, and the chain value ends the chunk.
  const metaEnd = ChunkHeaderBytes + header.metaLen;

  return {
    chunk: {
      header,
      // `metaCrc` covers the two lengths and the codec with the meta region.
      metaCovered: bytes.subarray(2 * U32Bytes, metaEnd),
      meta: bytes.subarray(ChunkHeaderBytes, metaEnd),
      body: bytes.subarray(metaEnd, len - ChainBytes),
      chain: bytes.subarray(len - ChainBytes, len),
    },
    rest: bytes.subarray(len),
  };
};

// A meta segment and the body segment it is paired with, not a range of bytes.
export interface ChunkFrame {
  readonly meta: Uint8Array;
  readonly body: Uint8Array;
}

// One data chunk, in file order: its stored size, its meta region, its frames.
export interface ChunkTableEntryEncoded {
  len: number;
  metaLen: number;
  count: number;
}

export const ChunkTableEntry: Schema.Codec<ChunkTableEntryEncoded> = Schema.Struct({
  len: Schema.Int,
  metaLen: Schema.Int,
  count: Schema.Int,
});

// Membership is decided on the raw size of frames, before they are compressed.
export const DefaultChunkSize = 2 * 1024 * 1024;
