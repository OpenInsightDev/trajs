/**
 * The format the exchange layer this package ships writes: the header a trajectory
 * starts with, the frame the parts of a trajectory are carried in, the metadata the
 * trajectory ends with, and the two directions of the trajectory's bytes — written
 * into a storage, and read out of the bytes it serves.
 *
 * Nothing here is published: a program reaches the format through
 * `Exchange.layer`, and the parts a trajectory holds through `Exchange.Part`. What
 * a trajectory states of itself is the layer's to state — the header it starts with,
 * the metadata it ends with, the version that metadata carries, and the magic those
 * bytes end with — so what reads either is built from the model the layer holds;
 * where a trajectory is kept is a storage's, so what reads and writes one takes the
 * bytes from there rather than carrying them.
 *
 * A trajectory is read at random where a part of it alone is wanted — the head for
 * the header, the tail for the metadata — and as a stream where the trajectory is:
 * the parts are carried in one frame, so reading them is reading the bytes from the
 * header to the metadata that follows them.
 */

import type { Bytes } from "@trajs/utils/Bytes";
import type { Compression, CompressionError } from "@trajs/utils/Compression";
import type { Storage, StorageError } from "@trajs/utils/Storage";
import type { StreamHash } from "@trajs/utils/StreamHash";
import { Effect, Fiber, Schema, Stream } from "effect";

import * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import type * as EventKit from "#/EventKit.ts";
import { Magic, Version, type Header, type Metadata, type Service } from "#/Exchange.ts";
import type * as ExtraKit from "#/ExtraKit.ts";
import { configOf, encodePart, reading } from "#/internal/parts.ts";
import * as Metric from "#/Metric.ts";
import type * as MetricKit from "#/MetricKit.ts";
import * as Toolkit from "#/Toolkit.ts";
import type * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * How one contribution of a kit names itself, as a trajectory states it: the name it
 * goes by and what it is for.
 *
 * What a kit states of each of its contributions is all a reader is handed: nothing
 * of the schemas a contribution is produced with travels with it.
 */
export const Contribution = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});

/** What each contribution of a kit states of itself, keyed by the tag it is produced under. */
const contribute = <Entry>(
  contributions: Readonly<Record<string, Entry>>,
  stated: (entry: Entry) => Schema.Schema.Type<typeof Contribution>,
): Record<string, Schema.Schema.Type<typeof Contribution>> =>
  Object.fromEntries(Object.entries(contributions).map(([tag, entry]) => [tag, stated(entry)]));

/** The header a trajectory starts with, as the JSON text it is carried in. */
const encodeHeader = ({
  extrakit,
  eventkit,
  metrickit,
  toolkit,
}: {
  extrakit: ExtraKit.Any;
  eventkit: EventKit.Any;
  metrickit: MetricKit.Any;
  toolkit: Toolkit.Any;
}): string =>
  JSON.stringify({
    toolkit: Toolkit.encode(toolkit),
    eventkit: contribute(eventkit.events, (event) =>
      Schema.encodeSync(Event.Metadata)(event.metadata),
    ),
    metrickit: contribute(metrickit.metrics, (metric) =>
      Schema.encodeSync(Metric.Metadata)(metric.metadata),
    ),
    extrakit: contribute(extrakit.extra, (extra) => ({
      name: extra.name,
      description: extra.description,
    })),
  });

/**
 * How many bytes state the length of the header a trajectory starts with and of the
 * metadata it ends with: four, big-endian, before the header and after the metadata.
 */
const LengthBytes = 4;

/** The length `length`, as the four big-endian bytes that state it. */
const encodeLength = (length: number): Uint8Array => {
  const bytes = new Uint8Array(LengthBytes);

  new DataView(bytes.buffer).setUint32(0, length, false);

  return bytes;
};

/** The length four big-endian bytes state, or `undefined` where fewer than four are read. */
const decodeLength = (bytes: Uint8Array): number | undefined =>
  bytes.length < LengthBytes
    ? undefined
    : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);

/** `body` as the bytes it is carried in: the length of it first, and the body after that. */
const lengthPrefixed = (body: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(LengthBytes + body.length);

  bytes.set(encodeLength(body.length));
  bytes.set(body, LengthBytes);

  return bytes;
};

/** Whether `bytes` are exactly the magic a whole trajectory ends with. */
const isMagic = (bytes: Uint8Array): boolean =>
  bytes.length === Magic.length && Magic.every((byte, at) => bytes[at] === byte);

/**
 * The header a trajectory states, and how much of the trajectory it takes to state
 * it: the header a trajectory starts with, and the offset just past it, which is
 * where the frame the parts are carried in begins.
 *
 * The header is read to be read again as what it describes — a trajectory is read
 * with no kit of its own — so where it ends is kept with it rather than read a
 * second time to find.
 */
export interface Stated {
  readonly header: Header;
  readonly end: bigint;
}

/**
 * Reads the header a trajectory starts with, as the head of the bytes it is held in.
 *
 * The header is carried as its length, four big-endian bytes, and the bytes of the
 * header after them ({@link LengthBytes}), so the head of a trajectory is read as far
 * as that length states and no further: what a trajectory states of itself is
 * knowable without the frame the parts are carried in being read.
 *
 * Bytes that end before a length, and bytes that end before the header it states,
 * fail as {@link TrajectoryError}: what a trajectory is of is the format's, so bytes
 * that do not hold its header are a trajectory that failed rather than bytes a
 * storage did not serve. The services are the ones the header's own schemas state,
 * so a model of plain schemas needs none.
 */
export const headerOf = <S extends Schema.ConstraintCodec<Header, unknown, never, never>>(
  header: S,
  bytes: Bytes<StorageError>,
): Effect.Effect<Stated, TrajectoryError | StorageError> => {
  const stated = Schema.fromJsonString(header);

  return Effect.gen(function* () {
    const prefix = yield* bytes.readAlloc({ offset: 0n, size: LengthBytes });
    const size = decodeLength(prefix);

    // The length of the header is what a trajectory starts with, so bytes that end
    // before one are not a trajectory at all.
    if (size === undefined) {
      return yield* Effect.fail(TrajectoryError.parse("the bytes end before a header length"));
    }

    const held = yield* bytes.readAlloc({ offset: BigInt(LengthBytes), size });

    if (held.length < size) {
      return yield* Effect.fail(TrajectoryError.parse("the bytes end before a header"));
    }

    return {
      header: yield* Schema.decodeUnknownEffect(stated)(new TextDecoder().decode(held)).pipe(
        Effect.mapError(TrajectoryError.parse),
      ),
      end: BigInt(LengthBytes + size),
    };
  });
};

/** How many bytes of the frame the parts are carried in are read at a time. */
const FrameChunk = 64 * 1024;

/**
 * The bytes of a trajectory that hold the frame the parts are carried in, from the
 * byte the frame begins at to the byte it ends before: one read at a time, and
 * never past the metadata that follows it.
 *
 * A range that is not a range — one that ends before it begins, which is what
 * bytes holding a metadata but no frame hold — is read as nothing at all, so what
 * is read of such a trajectory is nothing rather than its metadata read as a frame.
 *
 * The range is given first and the bytes after, so that what reads one is curried out
 * of the range alone, and what those bytes fail with is the caller's to state rather
 * than the format's: one range is read the same way wherever a trajectory is kept.
 */
const framesOf =
  <E>({ from, to }: { readonly from: bigint; readonly to: bigint }) =>
  (bytes: Bytes<E>): Stream.Stream<Uint8Array, E> =>
    Stream.unfold(from, (offset) => {
      const left = to - offset;

      if (left <= 0n) {
        return Effect.succeed(undefined);
      }

      return bytes
        .readAlloc({ offset, size: left < BigInt(FrameChunk) ? Number(left) : FrameChunk })
        .pipe(
          // A read that takes nothing is what ends the frame, so a file shorter than
          // the range the frame was read for ends it where the file does.
          Effect.map((chunk) =>
            chunk.length === 0 ? undefined : ([chunk, offset + BigInt(chunk.length)] as const),
          ),
        );
    });

/**
 * What a trajectory ends with: the metadata it states of its own bytes, and where
 * the frame those bytes carry the parts in ends.
 *
 * Where the frame ends is read with the metadata rather than after it, since the
 * metadata says where: what reads the parts reads them as far as the byte the
 * metadata begins at, and never as part of them.
 */
export interface Trailing {
  readonly metadata: Metadata;
  readonly end: bigint;
}

/**
 * Reads the metadata a trajectory ends with off the tail of the bytes it is held in,
 * which is what it is named by and how it states it was written: the metadata as
 * plain JSON, the length of it as four bytes after it, big-endian
 * ({@link LengthBytes}), and the magic of a whole trajectory last ({@link Magic}).
 *
 * The metadata follows the parts rather than being one, so it is read where it lies
 * rather than by reading the frame those parts are carried in — and how much of it
 * there is is read off the end instead, which is what states where it begins without
 * that frame being read either. Bytes that do not end with the magic were cut short,
 * and bytes that end with anything that is not a length before it hold no metadata —
 * either way a trajectory that failed rather than bytes a storage did not serve.
 *
 * The model is the schema of the metadata the layer holds, so what parses the JSON
 * is built from that model rather than stated again here ({@link Metadata}).
 */
export const trailingOf = <S extends Schema.ConstraintCodec<Metadata, unknown, never, never>>(
  metadata: S,
  bytes: Bytes<StorageError>,
): Effect.Effect<Trailing, TrajectoryError | StorageError> => {
  const stated = Schema.fromJsonString(metadata);

  return Effect.gen(function* () {
    const length = yield* bytes.length;
    const trailer = LengthBytes + Magic.length;

    // Bytes shorter than the length and the magic hold no metadata either, so none
    // are read of them: what is there would be read as a length that is not one.
    const tail =
      length < BigInt(trailer)
        ? new Uint8Array()
        : yield* bytes.readAlloc({ offset: length - BigInt(trailer), size: trailer });

    const size = decodeLength(tail);

    // A trajectory ends with the metadata of one only where it was written whole:
    // bytes that do not end with the magic were cut short, and bytes whose length
    // does not fit before the magic hold no metadata at all.
    if (
      size === undefined ||
      !isMagic(tail.subarray(LengthBytes)) ||
      BigInt(size) > length - BigInt(trailer)
    ) {
      return yield* Effect.fail(
        TrajectoryError.parse("the bytes do not end with the metadata of a trajectory"),
      );
    }

    const start = length - BigInt(trailer) - BigInt(size);

    const held = yield* bytes.readAlloc({ offset: start, size });

    return {
      metadata: yield* Schema.decodeUnknownEffect(stated)(new TextDecoder().decode(held)).pipe(
        Effect.mapError(TrajectoryError.parse),
      ),
      end: start,
    };
  });
};

/**
 * The metadata a trajectory ends with, as the bytes it is carried in: the metadata
 * itself as plain JSON, the length of it as four bytes after it, big-endian
 * ({@link LengthBytes}), which is what says where the metadata begins to what reads a
 * trajectory from its end, and the magic of a whole trajectory last ({@link Magic}).
 */
const encodeTrailing = <S extends Schema.ConstraintCodec<Metadata, unknown, never, never>>(
  metadata: S,
  stated: Metadata,
): Uint8Array => {
  const json = new TextEncoder().encode(Schema.encodeSync(Schema.fromJsonString(metadata))(stated));
  const bytes = new Uint8Array(json.length + LengthBytes + Magic.length);

  bytes.set(json);
  bytes.set(encodeLength(json.length), json.length);
  bytes.set(Magic, json.length + LengthBytes);

  return bytes;
};

/**
 * What a compression failed a frame it was asked to write or read with, as the
 * trajectory that failed: the bytes a frame carries are the format's, so a frame
 * that cannot be written or read is a trajectory that failed rather than a
 * compression that did.
 */
const framed = <E, R>(
  bytes: Stream.Stream<Uint8Array, E | CompressionError, R>,
): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
  bytes.pipe(
    Stream.catchTag("CompressionError", (cause) => Stream.fail(TrajectoryError.parse(cause))),
  );

/**
 * The exchange of the format this package ships, over where a trajectory is kept,
 * what carries its parts and what reads a digest off them: the header a trajectory
 * starts with and the metadata it ends with are the models the layer holds, so what
 * parses either is built from its model rather than stated again here, and where a
 * trajectory is kept is a storage's, so the bytes are read from and written into
 * what the storage offers.
 *
 * A trajectory is read at random where one part of it alone is wanted — the head for
 * the header, the tail for the metadata — and as a stream where what is wanted
 * is the trajectory: the frame is read from the header to the metadata that
 * follows it.
 *
 * A compression reports a frame it cannot write or read as a
 * {@link CompressionError}, which says nothing of a trajectory; a frame carries the
 * parts of a trajectory, so this side reports one it cannot write or read as the
 * {@link TrajectoryError} the trajectory failed with ({@link framed}). A storage
 * reports what it cannot read or write as a {@link StorageError}, which says
 * nothing of the trajectory either.
 *
 * The models are the schemas of the header and of the metadata the layer holds,
 * constrained to ones plain enough to parse without a service of their own: what
 * parses the header a trajectory starts with and the metadata it ends with is built
 * from them, and what `load` gives out is typed by them.
 */
export const service = <
  H extends Schema.ConstraintCodec<Header, unknown, never, never>,
  M extends Schema.ConstraintCodec<Metadata, unknown, never, never>,
>(
  header: H,
  metadata: M,
  storage: Storage,
  compression: Compression,
  hasher: StreamHash,
): Service => {
  return {
    load: (id) =>
      Effect.gen(function* () {
        const bytes = yield* storage.read(id);
        const stated = yield* headerOf(header, bytes);
        const trailing = yield* trailingOf(metadata, bytes);

        // The frame lies between the header and the metadata, so neither the head
        // nor the tail is read as part of it.
        const frame = framed(
          framesOf<StorageError>({ from: stated.end, to: trailing.end })(bytes).pipe(
            compression.decompress,
          ),
        );

        return {
          header: stated.header,
          metadata: trailing.metadata,
          read: reading(frame),
        };
      }),
    save:
      <C extends Config.AnyConfig, E, R>(trajectory: Trajectory.Trajectory<string, C, E, R>) =>
      (id: string) => {
        const config = configOf(trajectory);

        const encoded = Effect.gen(function* () {
          const headerText = encodeHeader(config);

          const frames = trajectory.pipe(Stream.mapEffect(encodePart(config), { concurrency: 1 }));

          // The digest is of the parts, and the parts are what the compression
          // writes, so the frames are handed to both at once: one reader writes
          // them into the frame, the other reads a digest off them.
          //
          // FIXME: a digest can be read off fewer parts than the frame carries.
          // `broadcastN` hands the frames over a pubsub, and a subscription ends
          // without draining what the slower reader has not taken yet, so the
          // digest a trajectory ends with can be that of a prefix of its parts —
          // the sample the viewer opens loses its last frame here. What writes
          // the frame and what reads a digest off them should read them in one
          // pass instead.
          const [written, hashed] = yield* Stream.broadcastN(frames, { n: 2, capacity: 16 });

          const digest = yield* Stream.run(hashed, hasher.digest).pipe(Effect.forkScoped);

          // The header is a frame of its own that the parts are written after, and the
          // frame it was written with is one stream the compression is read through
          // once it has finished with them.
          const headerBytes = new TextEncoder().encode(headerText);
          const header = Stream.make(lengthPrefixed(headerBytes));
          const writtenFrame = framed(written.pipe(compression.compress));

          const trailing = Fiber.join(digest).pipe(
            Effect.map((digest) =>
              encodeTrailing(metadata, {
                compression: compression.algorithm,
                hash: hasher.algorithm,
                digest,
                version: Version,
              }),
            ),
            Stream.fromEffect,
          );

          // The metadata states what the bytes of the trajectory were written with
          // and what they are named by, so it is emitted once the compression has
          // finished the frame it wrote for them and the digest has been read off
          // the parts it is of.
          return header.pipe(Stream.concat(writtenFrame), Stream.concat(trailing));
        }).pipe(Stream.unwrap, Stream.scoped);

        // What holds the bytes of a trajectory is held open for as long as they are
        // written, so the sink is run in the scope of the save itself.
        return Stream.run(encoded, storage.write(id)).pipe(Effect.scoped);
      },
  };
};
