import { Checksum, Compression, StreamHash } from "@trajs/utils";
import * as BinaryProtocol from "@trajs/utils/BinaryProtocol";
import type { CompressionError } from "@trajs/utils/Compression";
import { Effect, Option, Schema, Stream } from "effect";

import type * as Config from "#/Config.ts";
import * as EventKit from "#/EventKit.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { joined } from "#/internal/frames.ts";
import { ChainBytes, UuidFromByte } from "#/internal/schema.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Toolkit from "#/Toolkit.ts";

// What a chunk states before its two regions.
const headerFields = {
  metaCrc: BinaryProtocol.u32,
  bodyCrc: BinaryProtocol.u32,
  bodyLen: BinaryProtocol.u32,
  metaLen: BinaryProtocol.u32,
  compression: BinaryProtocol.u8.pipe(BinaryProtocol.decodeTo(Compression.Algorithm)),
};

// One chunk as it is stored: the header, the two regions it sizes, and the chain value.
// `bodyCrc` covers the body region alone, so the chain value sits outside it.
export const Chunk = BinaryProtocol.toCodec({
  ...headerFields,
  meta: BinaryProtocol.bytesOf("metaLen"),
  body: BinaryProtocol.bytesOf("bodyLen"),
  chain: BinaryProtocol.bytes(ChainBytes),
});

export type Chunk = Schema.Schema.Type<typeof Chunk>;

// One frame as a chunk holds it: the meta segment of one part and the body segment it pairs.
// It is a chunk without what the container states for it: no sizes, no checksums, no chain.
export type Frame = Pick<Chunk, "meta" | "body">;

// What a scan reads alone, before it knows a chunk's extent.
export const ChunkHeader = BinaryProtocol.toCodec(headerFields);

export type ChunkHeader = Schema.Schema.Type<typeof ChunkHeader>;

// The two `u32` checksums a header states first, so the bytes `metaCrc` covers begin after
// them (section 5).
const ChecksumBytes = 8;

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

// One chunk as a writer stores it, with a chain value that extends `prev`.
export const encodeChunk = (
  hash: StreamHash.Algorithm,
  prev: Uint8Array,
  {
    frames,
    compression,
  }: {
    readonly frames: ReadonlyArray<Frame>;
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

    const meta = joined(
      new Uint8Array(),
      frames.map((frame) => frame.meta),
    );

    const bodies = joined(
      new Uint8Array(),
      frames.map((frame) => frame.body),
    );

    const packed = yield* codecs.compressBytes({ algorithm: compression })(bodies);

    // A region the codec does not make smaller is stored unwrapped (section 5.1).
    const smaller = packed.length < bodies.length;

    const body = smaller ? packed : bodies;
    const code = smaller ? compression : Compression.Algorithm.enums.None;
    const bodyLen = body.length;

    // A length beyond a `u32` is refused where a part is accepted (section 14).
    const metaLen = meta.length;
    const crc = checksum.of({ algorithm: Checksum.Algorithm.enums.Crc32 });

    // A checksum sits before the bytes it covers, so the header is laid out with both left
    // zero, and laid out again once they are read.
    const header = { metaCrc: 0, bodyCrc: 0, bodyLen, metaLen, compression: code };
    const headerBytes = Schema.encodeSync(ChunkHeader)(header);

    // `metaCrc` covers the header past its two checksums, and the meta region (section 5).
    const afterChecksums = headerBytes.subarray(ChecksumBytes);
    const metaCrc = crc(joined(afterChecksums, [meta]));

    const bodyCrc = crc(body);

    // The chunk through its body: the bytes the chain value extends over (section 5.2).
    const unchained = joined(new Uint8Array(), [
      Schema.encodeSync(ChunkHeader)({ ...header, metaCrc, bodyCrc }),
      meta,
      body,
    ]);

    const chain = yield* chainOf(hash, prev, unchained);

    return joined(unchained, [chain]);
  });

// Membership is decided on the raw size of frames, before they are compressed.
export const DefaultChunkSize = 2 * 1024 * 1024;

// The frames of each chunk (section 10): a frame is the two segments a chunk holds for one
// part. A frame is added while the raw size stays within `chunkSize`, and closes the chunk
// before the frame that would exceed it.
export const chunkFramesOf =
  (chunkSize: number = DefaultChunkSize) =>
  <E, R>(frames: Stream.Stream<Frame, E, R>): Stream.Stream<ReadonlyArray<Frame>, E, R> =>
    Stream.suspend(() => {
      let held: Array<Frame> = [];
      let size = 0;

      return frames.pipe(
        Stream.mapAccumArray(
          () => undefined,
          (_state, batch) => {
            const out: Array<ReadonlyArray<Frame>> = [];

            for (const frame of batch) {
              const raw = frame.meta.length + frame.body.length;

              if (held.length > 0 && size + raw > chunkSize) {
                out.push(held);

                held = [];
                size = 0;
              }

              held.push(frame);
              size += raw;
            }

            return [undefined, out] as const;
          },
        ),
        Stream.concat(Stream.suspend(() => (held.length === 0 ? Stream.empty : Stream.make(held)))),
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

// The declarations a reader holds before it decodes a body: which trajectory the file
// holds, the release that wrote it, the algorithm every chain value uses, and the kits by
// name and by stored schema.
// One frame of these bytes is what a header states.
export const Declarations = Schema.Struct({
  id: UuidFromByte,
  version: Schema.String,
  hash: StreamHash.Algorithm,
  toolkit: Toolkit.ToolkitSchema,
  eventkit: EventKit.EventKitSchema,
  metrickit: MetricKit.MetricKitSchema,
  extrakit: ExtraKit.ExtraKitSchema,
}).annotate({ identifier: "Declarations" });

export type Declarations = Schema.Schema.Type<typeof Declarations>;

export const declarationsOf = (
  config: Config.AnyConfig,
  {
    id,
    version,
    hash,
  }: { readonly id: string; readonly version: string; readonly hash: StreamHash.Algorithm },
): Declarations => ({
  id,
  version,
  hash,
  toolkit: Toolkit.encode(config.toolkit),
  eventkit: EventKit.encode(config.eventkit),
  metrickit: MetricKit.encode(config.metrickit),
  extrakit: ExtraKit.encode(config.extrakit),
});

// A header is not a chunk: nothing pairs what it states, so nothing of it is a body. It states
// its declarations, and before them the checksum over them and their size.
// The chain value ends it, extending the value `Magic` starts, so a reader checks the header
// with no chunk before it.
export const Header = BinaryProtocol.toCodec({
  crc: BinaryProtocol.u32,
  len: BinaryProtocol.u32,
  declarations: BinaryProtocol.bytesOf("len"),
  chain: BinaryProtocol.bytes(ChainBytes),
});

export type Header = Schema.Schema.Type<typeof Header>;

// A footer is not a chunk: nothing pairs what it states, so nothing of it is a body. It states
// the chunk table, and after it the checksum over it and the digest of the file, and last the
// two fields that locate it.
// The fields are read from its last byte, so `footerLen` sizes the table in front of it and
// one message spans the whole footer.
export const Footer = BinaryProtocol.toCodec(
  {
    // The table is the only field, so it takes every byte `footerLen` leaves.
    table: BinaryProtocol.bytes(),
    crc: BinaryProtocol.u32,
    chain: BinaryProtocol.bytes(ChainBytes),
    footerLen: BinaryProtocol.u32,
    magic: BinaryProtocol.bytes(Magic.length),
  },
  { direction: "backward" },
);

export type Footer = Schema.Schema.Type<typeof Footer>;

// `footerLen` and the marker, which end every file and are what a locate reads alone.
const FooterLenBytes = 4;

const FooterTailBytes = FooterLenBytes + Magic.length;

// Where the footer begins in a trajectory of `length` bytes, or `undefined` when
// the last nine bytes cannot end a file.
// A reader confirms the place against the header and the footer.
export const footerStartOf = (length: bigint, tail: Uint8Array): bigint | undefined => {
  if (tail.length < FooterTailBytes) {
    return undefined;
  }

  // The two fields end the file, so they are read from the end of whatever the tail holds.
  const at = tail.length - FooterTailBytes;
  const magic = tail.subarray(at + FooterLenBytes);

  // Any four bytes can precede the marker by accident, so a tail holding another marker
  // ends no file (section 4.1).
  if (!Magic.every((byte, index) => magic[index] === byte)) {
    return undefined;
  }

  // A fixed-width integer is unsigned and little-endian (section 1).
  const footerLen = new DataView(tail.buffer, tail.byteOffset, tail.byteLength).getUint32(at, true);

  const end = BigInt(FooterTailBytes + footerLen);

  return length < end ? undefined : length - end;
};
