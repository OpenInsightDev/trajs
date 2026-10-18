/**
 * The format the exchange layer this package ships writes: the header a trajectory
 * starts with, the frame the parts of a trajectory are carried in, the metadata the
 * trajectory ends with, and the two directions of the trajectory's bytes — written
 * into a storage, and read out of the bytes it serves.
 *
 * Nothing here is published: a program reaches the format through
 * `Exchange.layer`, and the parts a trajectory holds through `Exchange.Part`. What
 * a trajectory states of itself is the layer's to state — the header it starts with
 * and the metadata it ends with — so what reads either is built from the model the
 * layer holds; where a trajectory is kept is a storage's, so what reads and writes
 * one takes the bytes from there rather than carrying them.
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
import { Effect, Fiber, Schema, SchemaTransformation, Stream } from "effect";
import { SchemaBinary } from "effect/encoding";

import * as Event from "#/Event.ts";
import type { EncodingServices, Header, Metadata, Service } from "#/Exchange.ts";
import type * as Extra from "#/Extra.ts";
import { readFrames } from "#/internal/frames.ts";
import * as Metric from "#/Metric.ts";
import * as Prompt from "#/Prompt.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

import pkg from "../../package.json" with { type: "json" };

/**
 * The version of this package, as `package.json` states it: the version of trajs a
 * trajectory states of itself, since the format a trajectory is in is this package's.
 */
const Version = pkg.version;

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
  extrakit: Extra.AnyKit;
  eventkit: Event.AnyKit;
  metrickit: Metric.AnyKit;
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

/**
 * What a trajectory ends with once it was written whole: the ASCII `TRAJS`, which is
 * what tells a reader the bytes it read are a trajectory written to its end rather
 * than one that was cut short.
 */
const Magic = new TextEncoder().encode("TRAJS");

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
 */
const framesOf = (
  bytes: Bytes<StorageError>,
  from: bigint,
  to: bigint,
): Stream.Stream<Uint8Array, StorageError> =>
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
 * A schema as the format states it: the part it reads and writes, and the services
 * of none.
 *
 * A part of a trajectory is rebuilt from plain schemas, so what those schemas state
 * is the services of none; a response part is the one that is not, and keeps what
 * the toolkit's own schemas state of it.
 */
type ServiceFree<S> =
  S extends Schema.Codec<infer A, infer I, infer _D, infer _E>
    ? Schema.Codec<A, I, never, never>
    : never;

/** The part schemas {@link part} builds, in the order a trajectory states them. */
export type PartMembers<C extends Trajectory.AnyConfig> = readonly [
  ServiceFree<ReturnType<typeof PromptPartTagged<C["extrakit"]>>>,
  ServiceFree<ReturnType<typeof Trajectory.SessionPart<C["extrakit"]>>>,
  ReturnType<typeof Trajectory.ResponsePart<C["toolkit"], C["extrakit"], true>>,
  ServiceFree<ReturnType<typeof Trajectory.EventPart<C["eventkit"]>>>,
  ServiceFree<ReturnType<typeof Trajectory.MetricPart<C["metrickit"]>>>,
];

/** The part a trajectory holds, as the format reads and writes one. */
type ProducedPart<C extends Trajectory.AnyConfig> = Schema.Union<PartMembers<C>>["Type"];

/**
 * A part schema as the format reads and writes it: the same part, stated as one that
 * needs no service of its own.
 *
 * A part of a trajectory is rebuilt from plain schemas, so what one takes is no
 * service of its own; a response part is the one that is not, so it is not passed
 * through here.
 */
const serviceFree = <A, I>(
  schema: Schema.Codec<A, I, unknown, unknown>,
): Schema.Codec<A, I, never, never> =>
  // SAFETY: a part schema states the services of the plain schemas it is rebuilt from,
  // which are none; the loose statement Effect's `mapFields` and `mapMembers` leave
  // behind is what this drops.
  schema as Schema.Codec<A, I, never, never>;

/**
 * The parts of a trajectory as the frames of the format carry them.
 *
 * It is {@link Trajectory.Part} with a prompt part's messages carrying their file
 * data tagged — see below for why a binary layout cannot carry the data as it is —
 * and every other part of the trajectory keeping its own layout, and its response
 * parts stated as {@link Trajectory.ResponsePart} states them for a streaming
 * trajectory: a trajectory is read as the most general trajectory, whose response
 * parts are streams, and the response parts of any other kind are the members of
 * that schema too, so one schema carries the response parts of every kind.
 *
 * A part is written through the schemas of the toolkit it was produced with, so
 * encoding one takes what those schemas state; what the other parts state is the
 * services of none, since a trajectory is rebuilt from plain schemas rather than read
 * as the schemas it was produced with.
 */
export const part = <C extends Trajectory.AnyConfig>(config: C): Schema.Union<PartMembers<C>> => {
  const members: PartMembers<C> = [
    // Every member is stated with the kit of the config, since what a part is read as
    // is what that kit states of it rather than what the call alone infers.
    serviceFree(PromptPartTagged<C["extrakit"]>(config.extrakit)),
    serviceFree(Trajectory.SessionPart<C["extrakit"]>(config.extrakit)),
    // What a trajectory is read as, whatever it was written as.
    Trajectory.ResponsePart<C["toolkit"], C["extrakit"], true>({
      toolkit: config.toolkit,
      extrakit: config.extrakit,
      stream: true,
    }),
    serviceFree(Trajectory.EventPart<C["eventkit"]>(config.eventkit)),
    serviceFree(Trajectory.MetricPart<C["metrickit"]>(config.metrickit)),
  ];

  return Schema.Union(members);
};

/**
 * Encodes one part of a trajectory as a SchemaBinary frame.
 *
 * The schema is the one the trajectory's own config describes — {@link part} — so a
 * part produced for a tool the toolkit no longer holds still encodes as the
 * unrestricted part it was produced as.
 */
const encodePart = <C extends Trajectory.AnyConfig>(config: C) => {
  const encode = Schema.encodeEffect(SchemaBinary.toCodec(part(config)));

  return (part: ProducedPart<C>): Effect.Effect<Uint8Array, TrajectoryError, EncodingServices<C>> =>
    encode(part).pipe(
      Effect.mapError((cause) => TrajectoryError.parse(cause)),
      // Frames may be views into one arena that the next encode reuses, and the
      // compressor holds a chunk until it has written it.
      Effect.map((frame) => frame.slice()),
    );
};

// HACK: `effect/ai` types a file part's data as `string | Uint8Array | URL`, and
// a `URL` encodes as a string the way any other does, so no binary layout of that
// union exists at all. The prompt schemas are therefore rebuilt below, the file
// data tagged, rather than taken as `effect/ai` has them: schemas that drift, a
// file part carried elsewhere or a message kind this side does not name, leave a
// part that is not the `Prompt.Message` it is declared as.
/**
 * The data a file part carries, as a file carries it: the data itself, with the
 * URL among it tagged under the URL it names rather than carried as the string
 * a URL encodes to.
 *
 * The three the data may be are `effect/ai`'s and are not this side's to change.
 */
const FilePartData = Schema.Union([
  Schema.String,
  Schema.Uint8Array,
  Schema.Struct({ url: Schema.URLFromString }).pipe(
    Schema.decodeTo(
      Schema.URL,
      SchemaTransformation.transform({
        decode: (tagged) => tagged.url,
        encode: (url) => ({ url }),
      }),
    ),
  ),
]);

/** A file part as a file carries it: the same part, its data carried as above. */
const TaggedFilePart = Prompt.FilePart.mapFields((fields) => ({ ...fields, data: FilePartData }));

/** A user message's parts as a file carries them: the file part tagged, the rest as is. */
const UserParts = Prompt.UserMessagePart.mapMembers((members) =>
  members.map((member) => (member === Prompt.FilePart ? TaggedFilePart : member)),
);

/** An assistant message's parts as a file carries them, the same way. */
const AssistantParts = Prompt.AssistantMessagePart.mapMembers((members) =>
  members.map((member) => (member === Prompt.FilePart ? TaggedFilePart : member)),
);

/**
 * The messages a prompt part holds, as a file carries them.
 *
 * A message's content is the string form of the message or the array of the parts
 * it is made of, and a file holds what that array holds — so the array is the
 * member whose parts are carried as above and the string form, which holds no
 * part, keeps the one `effect/ai` gave it: the member carrying parts is the one
 * an element is a field of, the string form being a codec of its own.
 */
const Messages = Schema.Array(
  Schema.Union([
    Prompt.SystemMessage,
    Prompt.UserMessage.mapFields((fields) => ({
      ...fields,
      content: fields.content.mapMembers((members) =>
        members.map((member) => ("value" in member ? Schema.Array(UserParts) : member)),
      ),
    })),
    Prompt.AssistantMessage.mapFields((fields) => ({
      ...fields,
      content: fields.content.mapMembers((members) =>
        members.map((member) => ("value" in member ? Schema.Array(AssistantParts) : member)),
      ),
    })),
    Prompt.ToolMessage,
  ]),
);

/**
 * A prompt part as a file carries it: the same part, its messages carried as
 * above.
 *
 * The tag is what a binary layout can carry where the data as it is is a union it
 * cannot, and every other part of the prompt part keeps its own layout.
 */
const PromptPartTagged = <K extends Extra.AnyKit>(extrakit: K) =>
  Trajectory.PromptPart(extrakit).mapFields((fields) => ({ ...fields, messages: Messages }));

/**
 * What a trajectory states of itself, as the config its parts are read and written
 * with.
 *
 * A config is what a trajectory is stated with, so what one holds is read off the
 * trajectory rather than declared beside it.
 */
const configOf = <C extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<C, E, R>,
) => ({
  stream: trajectory.stream,
  toolkit: trajectory.toolkit,
  eventkit: trajectory.eventkit,
  metrickit: trajectory.metrickit,
  extrakit: trajectory.extrakit,
});

/**
 * The trajectory a stream of parts makes, carrying the config its parts are read
 * with.
 *
 * A trajectory is its parts and what they were produced with, so what a trajectory
 * was read as is stated on the stream the bytes decode to.
 */
const trajectoryOf = <C extends Trajectory.AnyConfig, E, R>(
  parts: Stream.Stream<Trajectory.Part<C>, E, R>,
  config: C,
): Trajectory.Trajectory<C, E, R> => Object.assign(parts, config);

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

        return {
          header: stated.header,
          metadata: trailingOf(metadata, bytes).pipe(Effect.map((trailing) => trailing.metadata)),
          // SAFETY: reading with no config is reading with the kits that name nothing,
          // which is what `Trajectory.anyConfig` is.
          read: <C extends Trajectory.AnyConfig = Trajectory.AnyConfig>(
            config: C = Trajectory.anyConfig as C,
          ) =>
            trajectoryOf(
              // The frame lies between the header and the metadata, so neither the
              // head nor the tail is read as part of it.
              trailingOf(metadata, bytes).pipe(
                Effect.map(
                  (trailing) =>
                    // SAFETY: what a body reads as is the parts of the config it is read
                    // with, which is what the trajectory those parts make holds.
                    framed(
                      framesOf(bytes, stated.end, trailing.end).pipe(compression.decompress),
                    ).pipe(readFrames(part(config))) as Stream.Stream<
                      Trajectory.Part<C>,
                      TrajectoryError | StorageError
                    >,
                ),
                Stream.unwrap,
              ),
              config,
            ),
        };
      }),
    save:
      <C extends Trajectory.AnyConfig, E, R>(trajectory: Trajectory.Trajectory<C, E, R>) =>
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

          // The metadata states what the bytes of the trajectory were written with
          // and what they are named by, so it is emitted once the compression has
          // finished the frame it wrote for them and the digest has been read off
          // the parts it is of.
          return Stream.make(lengthPrefixed(new TextEncoder().encode(headerText))).pipe(
            Stream.concat(framed(written.pipe(compression.compress))),
            Stream.concat(
              Fiber.join(digest).pipe(
                Effect.map((digest) =>
                  encodeTrailing(metadata, {
                    compression: compression.algorithm,
                    hash: hasher.algorithm,
                    digest,
                    version: Version,
                  }),
                ),
                Stream.fromEffect,
              ),
            ),
          );
        }).pipe(Stream.unwrap, Stream.scoped);

        // What holds the bytes of a trajectory is held open for as long as they are
        // written, so the sink is run in the scope of the save itself.
        return Stream.run(encoded, storage.write(id)).pipe(Effect.scoped);
      },
  };
};
