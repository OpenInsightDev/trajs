import { Checksum, Compression, StreamHash } from "@trajs/utils";
import * as BinaryProtocol from "@trajs/utils/BinaryProtocol";
import type { CompressionError } from "@trajs/utils/Compression";
import { Effect, Option, Schema, Stream } from "effect";

import { joined } from "#/internal/frames.ts";
import { ChainBytes } from "#/internal/schema.ts";

// What a chunk states before its two regions.
const headerFields = {
  metaCrc: BinaryProtocol.u32,
  bodyCrc: BinaryProtocol.u32,
  bodyLen: BinaryProtocol.u32,
  metaLen: BinaryProtocol.u32,
  compression: BinaryProtocol.u8.pipe(BinaryProtocol.decodeTo(Compression.Algorithm)),
};

// The two regions a header sizes.
const regionFields = {
  meta: BinaryProtocol.bytesOf("metaLen"),
  body: BinaryProtocol.bytesOf("bodyLen"),
};

// The chunk through its body: the bytes both checksums and the chain value cover.
const coveredFields = { ...headerFields, ...regionFields };

const ChunkCovered = BinaryProtocol.toCodec(coveredFields);

// One chunk as it is stored. `bodyCrc` covers the body region alone, so the chain value
// sits outside it.
export const Chunk = BinaryProtocol.toCodec({
  ...coveredFields,
  chain: BinaryProtocol.bytes(ChainBytes),
});

export type Chunk = Schema.Schema.Type<typeof Chunk>;

// What a scan reads alone, before it knows a chunk's extent.
export const ChunkHeader = BinaryProtocol.toCodec(headerFields);

export type ChunkHeader = Schema.Schema.Type<typeof ChunkHeader>;

// What `metaCrc` covers: the header less its two checksums, and the meta region.
const MetaCovered = BinaryProtocol.toCodec({
  bodyLen: headerFields.bodyLen,
  metaLen: headerFields.metaLen,
  compression: headerFields.compression,
  meta: regionFields.meta,
});

// Four `u32`s and the codec: what a header takes before the two regions.
const ChunkHeaderBytes = 17;

// A chunk states its own extent, so a scan reads it before trusting its lengths.
export const chunkLen = (header: ChunkHeader): number =>
  ChunkHeaderBytes + ChainBytes + header.metaLen + header.bodyLen;

// One chunk and the bytes after it, or `undefined` when they hold none that this
// format states: a header that does not fit or names no codec, or an extent that
// runs past their end. The last is a writer that stopped inside a write.
export const chunkOf = (
  bytes: Uint8Array,
): { readonly chunk: Chunk; readonly rest: Uint8Array } | undefined => {
  const header = Schema.decodeUnknownOption(ChunkHeader)(bytes.subarray(0, ChunkHeaderBytes));

  if (Option.isNone(header)) {
    return undefined;
  }

  const len = chunkLen(header.value);

  if (len > bytes.length) {
    return undefined;
  }

  // The chunk is read whole rather than region by region, so its regions are the ones
  // the header states and no offset is computed here.
  const chunk = Schema.decodeUnknownOption(Chunk)(bytes.subarray(0, len));

  return Option.isNone(chunk) ? undefined : { chunk: chunk.value, rest: bytes.subarray(len) };
};

export const chunkBytesOf = (chunk: Omit<Chunk, "chain">): Uint8Array =>
  Schema.encodeSync(ChunkCovered)(chunk);

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

    // A chain value is the leading 8 bytes of the digest the header names.
    // The header states no digest length, so the cut is applied here.
    const hashing = streamHash.start({ algorithm: hash, length: ChainBytes });

    hashing.update(prev);

    if (bytes !== undefined) {
      hashing.update(bytes);
    }

    return hashing.digest();
  });

// A chunk as a writer stores it, with a chain value that extends `prev`.
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

    // A length beyond a `u32` is refused where a part is accepted (section 14).
    const metaLen = meta.length;
    const bodyLen = body.length;
    const crc = checksum.of();

    const metaCrc = crc(
      Schema.encodeSync(MetaCovered)({ bodyLen, metaLen, compression: code, meta }),
    );

    const bodyCrc = crc(body);

    const chunk = { metaCrc, bodyCrc, bodyLen, metaLen, compression: code, meta, body };

    const chain = yield* chainOf(hash, prev, chunkBytesOf(chunk));

    return Schema.encodeSync(Chunk)({ ...chunk, chain });
  });

// A meta segment and the body segment it is paired with, not a range of bytes.
export interface ChunkFrame {
  readonly meta: Uint8Array;
  readonly body: Uint8Array;
}

// One chunk as the chunker makes it: the two regions its frames join, and how many
// frames they hold.
export interface ChunkRegions {
  readonly meta: Uint8Array;
  readonly bodies: Uint8Array;
  readonly count: number;
}

// Membership is decided on the raw size of frames, before they are compressed.
export const DefaultChunkSize = 2 * 1024 * 1024;

// The frames of each chunk, joined as the two regions a chunk states (section 10).
// A frame is added while the raw size stays within `chunkSize`, and closes the
// chunk before the frame that would exceed it.
export const chunkFramesOf =
  (chunkSize: number = DefaultChunkSize) =>
  <E, R>(frames: Stream.Stream<ChunkFrame, E, R>): Stream.Stream<ChunkRegions, E, R> =>
    Stream.suspend(() => {
      let held: Array<ChunkFrame> = [];
      let size = 0;

      const regionsOf = (group: ReadonlyArray<ChunkFrame>): ChunkRegions => ({
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
          (_state, batch) => {
            const out: Array<ChunkRegions> = [];

            for (const frame of batch) {
              const raw = frame.meta.length + frame.body.length;

              if (held.length > 0 && size + raw > chunkSize) {
                out.push(regionsOf(held));

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
          Stream.suspend(() => (held.length === 0 ? Stream.empty : Stream.make(regionsOf(held)))),
        ),
      );
    });

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
}).annotate({ identifier: "ChunkTableEntry" });

// The table a footer holds: every data chunk, in file order, as a derived cache of what
// walking the chunks yields (section 9).
export interface ChunkTableEncoded {
  chunks: ReadonlyArray<ChunkTableEntryEncoded>;
}

export const ChunkTable: Schema.Codec<ChunkTableEncoded> = Schema.Struct({
  chunks: Schema.Array(ChunkTableEntry),
}).annotate({ identifier: "ChunkTable" });

// The marker begins every trajectory and ends every file, so it states no place
// of its own.
export const Magic = new TextEncoder().encode("TRAJS");

// The last bytes of a file, which a locate reads alone.
const tailFields = {
  footerLen: BinaryProtocol.u32,
  magic: BinaryProtocol.bytes(Magic.length),
};

const FileTail = BinaryProtocol.toCodec(tailFields);

// A footer is not a chunk: it pairs no meta region, states no compression code, and holds
// no frame of the format, so these fields are its whole layout.
// They are read from its last byte, so `footerLen` sizes the body in front of it and one
// message spans the whole footer.
export const Footer = BinaryProtocol.toCodec(
  {
    // The body is the only region, so it takes every byte `footerLen` leaves.
    body: BinaryProtocol.bytes(),
    bodyCrc: BinaryProtocol.u32,
    chain: BinaryProtocol.bytes(ChainBytes),
    ...tailFields,
  },
  { direction: "backward" },
);

export type Footer = Schema.Schema.Type<typeof Footer>;

// Where the footer begins in a trajectory of `length` bytes, or `undefined` when
// the last nine bytes cannot end a file.
// A reader confirms the place against the header chunk and the footer.
export const footerStartOf = (length: bigint, tail: Uint8Array): bigint | undefined => {
  const fileTail = Schema.decodeUnknownOption(FileTail)(tail);

  if (Option.isNone(fileTail)) {
    return undefined;
  }

  const { footerLen, magic } = fileTail.value;

  // Any four bytes can precede the marker by accident, so a tail holding another marker
  // ends no file (section 4.1).
  if (!Magic.every((byte, at) => magic[at] === byte)) {
    return undefined;
  }

  const end = BigInt(tail.length + footerLen);

  return length < end ? undefined : length - end;
};
