import { Checksum, Compression, StreamHash } from "@trajs/utils";
import type { CompressionError } from "@trajs/utils/Compression";
import type { Options as StreamHashOptions } from "@trajs/utils/StreamHash";
import { Effect, Schema, Stream } from "effect";

import { decodeU32, encodeU32, U32Bytes } from "#/internal/bytes.ts";
import { joined } from "#/internal/frames.ts";
import { ChainBytes } from "#/internal/schema.ts";

export interface ChunkHeader {
  readonly metaCrc: number;
  readonly bodyCrc: number;
  readonly bodyLen: number;
  readonly metaLen: number;
  readonly compression: Compression.Algorithm;
}

export const ChunkHeaderBytes = 4 * U32Bytes + 1;

export const ChunkOverheadBytes = ChunkHeaderBytes + ChainBytes;

// A chunk states its own extent, so a scan reads it before trusting its lengths.
export const chunkLen = (header: ChunkHeader): number =>
  ChunkOverheadBytes + header.metaLen + header.bodyLen;

// One chunk as it is stored. `bodyCrc` covers the body region alone, so the chain value
// sits outside it.
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

// The bytes the chain value and both checksums cover: the chunk through its body.
// `chain` lies outside them and `metaCovered` already holds the meta region.
export const chunkBytesOf = ({
  header,
  metaCovered,
  body,
}: Omit<Chunk, "chain" | "meta">): Uint8Array => {
  const bytes = new Uint8Array(chunkLen(header) - ChainBytes);

  // A `ChunkHeader` holds `u32`s, so each checksum has the bytes it is stored as.
  bytes.set(encodeU32(header.metaCrc)!, 0);
  bytes.set(encodeU32(header.bodyCrc)!, U32Bytes);
  bytes.set(metaCovered, 2 * U32Bytes);
  bytes.set(body, ChunkHeaderBytes + header.metaLen);

  return bytes;
};

// A chain value is the leading 8 bytes of the digest the header names.
// The header states no digest length, so the cut is applied here.
export const chainHashOptions = (hash: StreamHash.Algorithm): StreamHashOptions => ({
  algorithm: hash,
  length: ChainBytes,
});

// The chain value that extends `prev` over `bytes` (section 5.2), or the value
// the first chunk extends when `bytes` is omitted.
// A trajectory starts from `Magic`, so that value is `chainOf(hash, Magic)`.
export const chainOf = (
  hash: StreamHash.Algorithm,
  prev: Uint8Array,
  bytes?: Uint8Array,
): Effect.Effect<Uint8Array, never, StreamHash.StreamHash> =>
  Effect.gen(function* () {
    const streamHash = yield* StreamHash.StreamHash;
    const hashing = streamHash.start(chainHashOptions(hash));

    hashing.update(prev);

    if (bytes !== undefined) {
      hashing.update(bytes);
    }

    return hashing.digest();
  });

// One chunk as a writer assembles it: the two regions of its frames, and the codec
// a writer prefers for its body (section 5.1).
export const encodeChunk = (
  hash: StreamHash.Algorithm,
  prev: Uint8Array,
  {
    meta,
    bodies,
    compression,
  }: {
    readonly meta: Uint8Array;
    readonly bodies: Uint8Array;
    readonly compression: Compression.Algorithm;
  },
): Effect.Effect<
  Uint8Array,
  CompressionError,
  Checksum.Checksum | Compression.Compression | StreamHash.StreamHash
> =>
  Effect.gen(function* () {
    const checksum = yield* Checksum.Checksum;
    const codecs = yield* Compression.Compression;

    const packed = yield* codecs.compressBytes({ algorithm: compression })(bodies);

    // A region the codec does not make smaller is stored unwrapped (section 5.1).
    const smaller = packed.length < bodies.length;

    const body = smaller ? packed : bodies;
    const code = smaller ? compression : Compression.Algorithm.enums.None;
    const metaLen = meta.length;
    const bodyLen = body.length;

    // `metaCovered` starts where the two checksums end, so it states the two
    // lengths, the codec, and the meta region.
    // A length beyond a `u32` is refused where a part is accepted (section 14).
    const metaCovered = new Uint8Array(ChunkHeaderBytes - 2 * U32Bytes + metaLen);

    metaCovered.set(encodeU32(bodyLen)!, 0);
    metaCovered.set(encodeU32(metaLen)!, U32Bytes);
    metaCovered[2 * U32Bytes] = code;
    metaCovered.set(meta, ChunkHeaderBytes - 2 * U32Bytes);

    const crc = checksum.of();

    const header: ChunkHeader = {
      metaCrc: crc(metaCovered),
      bodyCrc: crc(body),
      bodyLen,
      metaLen,
      compression: code,
    };

    const covered = chunkBytesOf({ header, metaCovered, body });
    const chain = yield* chainOf(hash, prev, covered);

    const bytes = new Uint8Array(covered.length + ChainBytes);

    bytes.set(covered);
    bytes.set(chain, covered.length);

    return bytes;
  });

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

// The frames of each chunk, joined as the two regions a chunk states (section 10).
// A frame is added while the raw size stays within `chunkSize`, and closes the
// chunk before the frame that would exceed it.
export const chunkFramesOf =
  (chunkSize: number = DefaultChunkSize) =>
  <E, R>(
    frames: Stream.Stream<ChunkFrame, E, R>,
  ): Stream.Stream<
    { readonly meta: Uint8Array; readonly bodies: Uint8Array; readonly count: number },
    E,
    R
  > =>
    Stream.suspend(() => {
      let held: Array<ChunkFrame> = [];
      let size = 0;

      const closed = (group: ReadonlyArray<ChunkFrame>) => ({
        meta: joined(
          new Uint8Array(),
          group.map((frame) => frame.meta),
        ),
        bodies: joined(
          new Uint8Array(),
          group.map((frame) => frame.body),
        ),
        count: group.length,
      });

      return frames.pipe(
        Stream.mapAccumArray(
          () => undefined,
          (_state, chunk) => {
            const out: Array<ReturnType<typeof closed>> = [];

            for (const frame of chunk) {
              const raw = frame.meta.length + frame.body.length;

              if (held.length > 0 && size + raw > chunkSize) {
                out.push(closed(held));

                held = [];
                size = 0;
              }

              held.push(frame);
              size += raw;
            }

            return [undefined, out] as const;
          },
        ),
        Stream.concat(
          Stream.suspend(() => (held.length === 0 ? Stream.empty : Stream.make(closed(held)))),
        ),
      );
    });

// The marker begins every trajectory and ends every file, so it states no place
// of its own.
export const Magic = new TextEncoder().encode("TRAJS");

// Where the footer chunk begins in a trajectory of `length` bytes, or
// `undefined` when the last nine bytes cannot end a file.
// A reader confirms the place against the header chunk and the footer chunk.
export const footerStartOf = (length: bigint, tail: Uint8Array): bigint | undefined => {
  // The tail is a `u32` and the marker, so anything else states no footer.
  const tailBytes = U32Bytes + Magic.length;

  if (tail.length !== tailBytes) {
    return undefined;
  }

  // The bytes hold a tail, so its length reads.
  const footerLen = decodeU32(tail)!;

  // A footer chunk takes at least the bytes before its two regions.
  if (footerLen < ChunkOverheadBytes || !Magic.every((byte, at) => tail[U32Bytes + at] === byte)) {
    return undefined;
  }

  const end = BigInt(tailBytes + footerLen);

  return length < end ? undefined : length - end;
};
