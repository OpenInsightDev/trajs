import type { Compression } from "@trajs/utils";
import { Schema } from "effect";

import { U32Bytes } from "#/internal/bytes.ts";
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
