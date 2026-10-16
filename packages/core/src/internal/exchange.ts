/**
 * The format the exchange layer this package ships writes: the header line a
 * recording starts with, the frames the parts of a trajectory are carried in, the
 * digest those frames are read off, and the two directions of the recording's
 * bytes — written into a storage, and read out of the bytes it serves.
 *
 * Nothing here is published: a program reaches the format through
 * `Exchange.layer`, and the parts a recording holds through `Exchange.Part`. The
 * header a recording states is the layer's to state, so what reads one is built
 * from the model the layer holds; where a recording is kept is a storage's, so
 * what reads and writes one takes the bytes from there rather than carrying them.
 *
 * A recording is read at random where a part of it alone is wanted — the head for
 * the header line, the tail for the digest — and as a stream where the trajectory
 * is: the parts are carried in one frame, so reading them is reading the bytes
 * from the header line to the digest that follows them.
 */

import type { Bytes } from "@trajs/utils/Bytes";
import type { Compression, CompressionError } from "@trajs/utils/Compression";
import type { Storage, StorageError } from "@trajs/utils/Storage";
import type { StreamHash } from "@trajs/utils/StreamHash";
import { Effect, Fiber, Schema, SchemaTransformation, Stream } from "effect";
import * as Arr from "effect/Array";
import { SchemaBinary } from "effect/encoding";

import * as Event from "#/Event.ts";
import type { EncodingServices, Header, Service } from "#/Exchange.ts";
import type * as Extra from "#/Extra.ts";
import * as Metric from "#/Metric.ts";
import * as Prompt from "#/Prompt.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * How one contribution of a kit names itself, as a recording states it: the name it
 * goes by and what it is for.
 *
 * What a kit states of each of its contributions is all a reader is handed: nothing
 * of the schemas a contribution is recorded with travels with it.
 */
export const Contribution = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});

/** What each contribution of a kit states of itself, keyed by the tag it is recorded under. */
const contribute = <Entry>(
  contributions: Readonly<Record<string, Entry>>,
  stated: (entry: Entry) => Schema.Schema.Type<typeof Contribution>,
): Record<string, Schema.Schema.Type<typeof Contribution>> =>
  Object.fromEntries(Object.entries(contributions).map(([tag, entry]) => [tag, stated(entry)]));

/** The header line a recording starts with, as the JSON text it is carried in. */
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

/** The byte a header line ends with. */
const Newline = 0x0a;

/**
 * How many bytes of the head of a recording are read at a time while the header
 * line is looked for: a line is read in the order it is carried, so what is read
 * of it first is where it starts.
 */
const HeaderChunk = 4 * 1024;

/**
 * The header a recording states, and how much of the recording it takes to state
 * it: the line a recording starts with, and the offset just past it, which is
 * where the frame the parts are carried in begins.
 *
 * The line is read to be read again as what it describes — a recording is read
 * with no kit of its own — so where it ends is kept with it rather than read a
 * second time to find.
 */
export interface Stated {
  readonly header: Header;
  readonly end: bigint;
}

/**
 * Reads the header line a recording starts with, as the head of the bytes it is
 * held in.
 *
 * The line ends wherever the newline fell, which is not known before it is read,
 * so the head of the recording is read a chunk at a time until one of them holds
 * that newline ({@link HeaderChunk}); the length of the bytes is not read to tell
 * where that is, since a line is short and one read of the head answers it.
 *
 * Bytes that end before a newline, and a line that is not a header, fail as
 * {@link TrajectoryError}: what a recording is of is the format's, so bytes that
 * do not hold its first line are a recording that failed rather than bytes a
 * storage did not serve. The services are the ones the header's own schemas
 * state, so a model of plain schemas needs none.
 */
export const headerOf = <S extends Schema.ConstraintCodec<Header, unknown, never, never>>(
  header: S,
  bytes: Bytes<StorageError>,
): Effect.Effect<Stated, TrajectoryError | StorageError> => {
  const line = Schema.fromJsonString(header);

  return Effect.gen(function* () {
    const decoder = new TextDecoder();
    let text = "";
    let read = 0n;

    while (true) {
      const start = read;
      const chunk = yield* bytes.readAlloc({ offset: start, size: HeaderChunk });

      // The bytes ending before a newline is a file with no header line, and the
      // header line is what tells a reader the file is a trajectory at all.
      if (chunk.length === 0) {
        return yield* Effect.fail(TrajectoryError.parse("the bytes end before a header line"));
      }

      read = start + BigInt(chunk.length);

      const at = chunk.indexOf(Newline);

      if (at === -1) {
        text += decoder.decode(chunk, { stream: true });
        continue;
      }

      text += decoder.decode(chunk.subarray(0, at));

      const stated = yield* Schema.decodeUnknownEffect(line)(text).pipe(
        Effect.mapError(TrajectoryError.parse),
      );

      // The newline ends the line, so the frame follows it rather than the chunk
      // the newline happened to fall in.
      return { header: stated, end: start + BigInt(at + 1) };
    }
  });
};

/** How many bytes of the frame the parts are carried in are read at a time. */
const FrameChunk = 64 * 1024;

/**
 * The bytes of a recording that hold the frame the parts are carried in, from the
 * byte the frame begins at to the byte it ends before: one read at a time, and
 * never past the digest that follows it.
 *
 * A range that is not a range — one that ends before it begins, which is what
 * bytes shorter than a digest hold — is read as nothing at all, so what is read
 * of a recording that is too short is nothing rather than its digest read as a
 * frame.
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
 * A part of a recording is rebuilt from plain schemas, so what those schemas state
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

/** The part a recording holds, as the format reads and writes one. */
type RecordedPart<C extends Trajectory.AnyConfig> = Schema.Union<PartMembers<C>>["Type"];

/**
 * A part schema as the format reads and writes it: the same part, stated as one that
 * needs no service of its own.
 *
 * A part of a recording is rebuilt from plain schemas, so what one takes is no
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
 * trajectory: a recording is read as the most general trajectory, whose response
 * parts are streams, and the response parts of any other kind are the members of
 * that schema too, so one schema carries the response parts of every kind.
 *
 * A part is written through the schemas of the toolkit it was recorded with, so
 * encoding one takes what those schemas state; what the other parts state is the
 * services of none, since a recording is rebuilt from plain schemas rather than read
 * as the schemas it was recorded with.
 */
export const part = <C extends Trajectory.AnyConfig>(config: C): Schema.Union<PartMembers<C>> => {
  const members: PartMembers<C> = [
    // Every member is stated with the kit of the config, since what a part is read as
    // is what that kit states of it rather than what the call alone infers.
    serviceFree(PromptPartTagged<C["extrakit"]>(config.extrakit)),
    serviceFree(Trajectory.SessionPart<C["extrakit"]>(config.extrakit)),
    // What a recording is read as, whatever it was written as.
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
 * part recorded against a tool the toolkit no longer holds still encodes as the
 * unrestricted part it was recorded as.
 */
const encodePart = <C extends Trajectory.AnyConfig>(config: C) => {
  const encode = Schema.encodeEffect(SchemaBinary.toCodec(part(config)));

  return (part: RecordedPart<C>): Effect.Effect<Uint8Array, TrajectoryError, EncodingServices<C>> =>
    encode(part).pipe(
      Effect.mapError((cause) => TrajectoryError.parse(cause)),
      // Frames may be views into one arena that the next encode reuses, and the
      // compressor holds a chunk until it has written it.
      Effect.map((frame) => frame.slice()),
    );
};

/**
 * The parts the frames of a body carry, as a stream.
 *
 * A part is one frame, and a frame can span chunks or share one with the frames
 * around it, so the body is fed to one parser as it arrives: the parts come out in
 * the order they were recorded, and a body that ends in the middle of a frame fails
 * as a {@link TrajectoryError} rather than losing the part. The parser belongs to a
 * run, since it is the state one body is read with.
 */
const decodeParts =
  <C extends Trajectory.AnyConfig>(config: C) =>
  <E, R>(
    body: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<RecordedPart<C>, E | TrajectoryError, R> =>
    Stream.suspend(() => {
      const parser = SchemaBinary.parser(part(config));

      return body.pipe(
        Stream.mapAccumArrayEffect(
          () => undefined,
          (state, chunks) =>
            Effect.forEach(chunks, (chunk) => parser.feed(chunk), { concurrency: 1 }).pipe(
              Effect.mapError(TrajectoryError.parse),
              Effect.map((parts) => [state, Arr.flatten(parts)] as const),
            ),
        ),
        Stream.concat(
          Stream.unwrap(
            parser.end.pipe(Effect.mapError(TrajectoryError.parse), Effect.as(Stream.empty)),
          ),
        ),
      );
    });

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
 * A trajectory is its parts and what they were recorded with, so what a recording
 * was read as is stated on the stream the bytes decode to.
 */
const trajectoryOf = <C extends Trajectory.AnyConfig, E, R>(
  parts: Stream.Stream<Trajectory.Part<C>, E, R>,
  config: C,
): Trajectory.Trajectory<C, E, R> => Object.assign(parts, config);

/**
 * The digest a recording ends with, as the hex a {@link StreamHash} reads one off
 * with: 64 characters, as its `digest` states, and so 64 bytes at the end of
 * every recording.
 */
const DigestBytes = 64;

const DigestText = new RegExp(`^[0-9a-f]{${DigestBytes}}$`);

/**
 * Reads the digest a recording ends with off the tail of the bytes it is held in,
 * which is what the recording is named by: 64 characters of hex
 * ({@link DigestBytes}).
 *
 * The digest follows the parts rather than being one, so it is read where it lies
 * rather than by reading the frame those parts are carried in. Bytes that end in
 * anything else are a recording that does not end with a digest — one written
 * before the format held one, or one that was cut short — which is a recording
 * that failed rather than bytes a storage did not serve.
 */
export const digestOf = (
  bytes: Bytes<StorageError>,
): Effect.Effect<string, TrajectoryError | StorageError> =>
  Effect.gen(function* () {
    const length = yield* bytes.length;

    // Bytes shorter than a digest hold none at all, so none are read of them: what
    // is there would be read as a digest that is not one.
    const tail =
      length < BigInt(DigestBytes)
        ? new Uint8Array()
        : yield* bytes.readAlloc({ offset: length - BigInt(DigestBytes), size: DigestBytes });

    const stated = new TextDecoder().decode(tail);

    return DigestText.test(stated)
      ? stated
      : yield* Effect.fail(TrajectoryError.parse("the bytes do not end with a digest"));
  });

/**
 * What a compression failed a frame it was asked to write or read with, as the
 * recording that failed: the bytes a frame carries are the format's, so a frame
 * that cannot be written or read is a recording that failed rather than a
 * compression that did.
 */
const framed = <E, R>(
  bytes: Stream.Stream<Uint8Array, E | CompressionError, R>,
): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
  bytes.pipe(
    Stream.catchTag("CompressionError", (cause) => Stream.fail(TrajectoryError.parse(cause))),
  );

/**
 * The exchange of the format this package ships, over where a recording is kept,
 * what carries its parts and what reads a digest off them: the header of a
 * recording is the model the layer holds, so what parses one is built from that
 * model rather than stated again here, and where a recording is kept is a
 * storage's, so the bytes are read from and written into what the storage offers.
 *
 * A recording is read at random where one part of it alone is wanted — the head
 * for the header line, the tail for the digest — and as a stream where what is
 * wanted is the trajectory: the frame is read from the header line to the digest
 * that follows it.
 *
 * A compression reports a frame it cannot write or read as a
 * {@link CompressionError}, which says nothing of a recording; a frame carries the
 * parts of a recording, so this side reports one it cannot write or read as the
 * {@link TrajectoryError} the recording failed with ({@link framed}). A storage
 * reports what it cannot read or write as a {@link StorageError}, which says
 * nothing of the recording either.
 *
 * The header model is the schema of the header the layer holds, constrained to a
 * header plain enough to read without a service of its own: what parses the line
 * is built from it, and what `load` gives out is typed by it.
 */
export const service = <S extends Schema.ConstraintCodec<Header, unknown, never, never>>(
  header: S,
  storage: Storage,
  compression: Compression,
  hasher: StreamHash,
): Service => {
  return {
    load: (id) =>
      Effect.gen(function* () {
        const bytes = yield* storage.read(id);
        const stated = yield* headerOf(header, bytes);
        const length = yield* bytes.length;

        // The parts are carried in the bytes between the line a recording states
        // itself in and the digest it ends with, so what is read of it is the
        // frame alone — the head and the tail are read for what they are, and
        // never as part of it.
        const frame = framesOf(bytes, stated.end, length - BigInt(DigestBytes));

        return {
          // What loading a recording reads, and so what it knows of one: what it
          // states of itself, without the frame or the digest being read.
          header: stated.header,
          digest: digestOf(bytes),
          read: () =>
            trajectoryOf(
              framed(frame.pipe(compression.decompress)).pipe(decodeParts(Trajectory.anyConfig)),
              Trajectory.anyConfig,
            ),
        };
      }),
    save:
      <C extends Trajectory.AnyConfig, E, R>(trajectory: Trajectory.Trajectory<C, E, R>) =>
      (id: string) => {
        const config = configOf(trajectory);

        const recording = Effect.gen(function* () {
          const line = encodeHeader(config);

          const frames = trajectory.pipe(Stream.mapEffect(encodePart(config), { concurrency: 1 }));

          // The digest is of the parts, and the parts are what the compression
          // writes, so the frames are handed to both at once: one reader writes
          // them into the frame, the other reads a digest off them.
          const [written, hashed] = yield* Stream.broadcastN(frames, { n: 2, capacity: 16 });

          const digest = yield* Effect.forkScoped(Stream.run(hashed, hasher.digest));

          // The digest follows the parts it is of, so it is emitted once the
          // compression has finished the frame it wrote for them.
          return Stream.concat(
            Stream.make(new TextEncoder().encode(`${line}\n`)),
            Stream.concat(
              framed(written.pipe(compression.compress)),
              Stream.fromEffect(
                Fiber.join(digest).pipe(Effect.map((hex) => new TextEncoder().encode(hex))),
              ),
            ),
          );
        }).pipe(Stream.unwrap, Stream.scoped);

        // What holds the bytes of a recording is held open for as long as they are
        // written, so the sink is run in the scope of the save itself.
        return Effect.scoped(Stream.run(recording, storage.write(id)));
      },
  };
};
