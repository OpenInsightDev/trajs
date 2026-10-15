/**
 * The format the exchange layer this package ships writes: the header line a
 * recording starts with, the frames the parts of a trajectory are carried in, the
 * digest those frames are read off, and the two directions of the recording's
 * bytes.
 *
 * Nothing here is published: a program reaches the format through
 * `Exchange.layer`, and the parts a recording holds through `Exchange.Part`. The
 * header a recording states is the layer's to state, so what reads one is built
 * from the model the layer holds.
 */

import { Effect, Fiber, Pull, Schema, SchemaTransformation, Sink, Stream } from "effect";
import * as Arr from "effect/Array";
import { SchemaBinary } from "effect/encoding";

import * as Event from "#/Event.ts";
import type { Compression, EncodingServices, Header, Service } from "#/Exchange.ts";
import type * as Extra from "#/Extra.ts";
import type { Hasher } from "#/Indexing.ts";
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
  metadata,
  metrickit,
  toolkit,
}: {
  extrakit: Extra.AnyKit;
  eventkit: Event.AnyKit;
  metadata: Trajectory.Metadata;
  metrickit: Metric.AnyKit;
  toolkit: Toolkit.Any;
}): string =>
  JSON.stringify({
    metadata: Schema.encodeSync(Trajectory.Metadata)(metadata),
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
 * A sink that reads the header line a recording starts with, leaving the frames that
 * follow it over for whatever reads them next.
 *
 * The newline ends the line wherever it fell, which is inside a chunk of bytes
 * rather than at its end, so the chunk it is in is cut and its tail left over with
 * the chunks pulled alongside it. Bytes that end before a newline, and a line that
 * is not a header, fail as a {@link TrajectoryError}.
 *
 * The services are the ones the header's own schemas state, so a model of plain
 * schemas needs none.
 */
export const headerSink = <S extends Schema.Constraint>(
  header: S,
): Sink.Sink<S["Type"], Uint8Array, Uint8Array, TrajectoryError, S["DecodingServices"]> => {
  const line = Schema.fromJsonString(header);

  return Sink.fromTransform((upstream) =>
    Effect.gen(function* () {
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        // The bytes ending is a file with no header line, and the header line is
        // what tells a reader the file is a trajectory at all.
        const chunks = yield* upstream.pipe(
          Pull.catchDone(() =>
            Effect.fail(TrajectoryError.parse("the bytes end before a header line")),
          ),
        );

        for (let index = 0; index < chunks.length; index++) {
          const chunk = chunks[index];
          const at = chunk.indexOf(Newline);

          if (at === -1) {
            text += decoder.decode(chunk, { stream: true });
            continue;
          }

          text += decoder.decode(chunk.subarray(0, at));

          // What the newline did not end is a frame as much as the chunks pulled
          // with it are.
          const frames = [chunk.subarray(at + 1), ...chunks.slice(index + 1)].filter(
            (frame) => frame.length > 0,
          );

          const stated = yield* Schema.decodeUnknownEffect(line)(text).pipe(
            Effect.mapError(TrajectoryError.parse),
          );

          return [stated, Arr.isReadonlyArrayNonEmpty(frames) ? frames : undefined];
        }
      }
    }),
  );
};

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
 * with and the metadata it goes by.
 *
 * A trajectory is its parts and what they were recorded with, so what a recording
 * was read as is stated on the stream the bytes decode to.
 */
const trajectoryOf = <C extends Trajectory.AnyConfig, E, R>(
  parts: Stream.Stream<Trajectory.Part<C>, E, R>,
  config: C,
  metadata: Trajectory.Metadata,
): Trajectory.Trajectory<C, E, R> => Object.assign(parts, { ...config, metadata });

/**
 * The digest a recording ends with, as the hex a {@link Hasher} reads one off
 * with: 64 characters, as its `digest` states, and so 64 bytes at the end of
 * every recording.
 */
const DigestBytes = 64;

const DigestText = new RegExp(`^[0-9a-f]{${DigestBytes}}$`);

/** The bytes of `chunks` joined onto `held`, in the order they arrived. */
const joined = (held: Uint8Array, chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  let length = held.length;

  for (const chunk of chunks) {
    length += chunk.length;
  }

  const bytes = new Uint8Array(length);

  bytes.set(held);

  let at = held.length;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

/**
 * Drops the digest a recording ends with: it is no part of the frame the parts
 * are carried in, so what reads that frame is handed the bytes without it.
 *
 * How many bytes to drop is known before any of them arrive ({@link DigestBytes}),
 * but which bytes they are is not: that many are held back as the chunks arrive
 * and everything before them is emitted, and whatever is still held when the
 * stream ends is left behind.
 */
const withoutDigest = <E, R>(
  bytes: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<Uint8Array, E, R> =>
  bytes.pipe(
    Stream.mapAccumArrayEffect(
      () => new Uint8Array(0),
      (held, chunks) => {
        const all = joined(held, chunks);
        const kept = Math.min(DigestBytes, all.length);
        const emitted = all.slice(0, all.length - kept);

        return Effect.succeed([
          all.slice(all.length - kept),
          emitted.length > 0 ? [emitted] : [],
        ] as const);
      },
    ),
  );

/**
 * A sink that reads the digest a recording ends with.
 *
 * The digest is the last {@link DigestBytes} bytes of what a recording carries,
 * so the sink reads them to their end and holds none of the rest: what a recording
 * ends with is the hex a {@link Hasher} read off its parts, so bytes that end in
 * anything else are a recording that does not end with a digest — one written
 * before the format held one, or one that was cut short.
 */
const digestSink: Sink.Sink<string, Uint8Array, never, TrajectoryError> = Sink.reduce(
  () => new Uint8Array(0),
  (held, chunk: Uint8Array) => {
    const all = joined(held, [chunk]);

    return all.slice(Math.max(0, all.length - DigestBytes));
  },
).pipe(
  Sink.mapEffect((tail) => {
    const stated = new TextDecoder().decode(tail);

    return DigestText.test(stated)
      ? Effect.succeed(stated)
      : Effect.fail(TrajectoryError.parse("the bytes do not end with a digest"));
  }),
);

/**
 * The exchange of the format this package ships, over the sink that reads what a
 * recording states itself with, the compression its parts are carried in and the
 * hasher those parts are digested with: the head of a recording is the model the
 * layer holds, so it reads one rather than stating the model again here, and what
 * writes and reads a frame is the compression the layer was provided with, so the
 * same format is carried by `node:zlib` in one program and by WebAssembly in
 * another.
 *
 * A compression reports a frame it cannot write or read as a
 * {@link TrajectoryError} itself, since which bytes a frame is refused for is the
 * compression's to say and not this side's.
 */
export const service = (
  sink: Sink.Sink<Header, Uint8Array, Uint8Array, TrajectoryError>,
  compression: Compression,
  hasher: Hasher,
): Service => {
  return {
    metadata: sink,
    write: <C extends Trajectory.AnyConfig, E, R>(trajectory: Trajectory.Trajectory<C, E, R>) =>
      Stream.scoped(
        Stream.unwrap(
          Effect.gen(function* () {
            const config = configOf(trajectory);

            const line = encodeHeader({ ...config, metadata: trajectory.metadata });

            const frames = trajectory.pipe(
              Stream.mapEffect(encodePart(config), { concurrency: 1 }),
            );

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
                written.pipe(compression.compress),
                Stream.fromEffect(
                  Fiber.join(digest).pipe(Effect.map((hex) => new TextEncoder().encode(hex))),
                ),
              ),
            );
          }),
        ),
      ),
    digest: digestSink,
    read:
      <
        Toolkit extends Toolkit.Any,
        Eventkit extends Event.AnyKit,
        Metrickit extends Metric.AnyKit,
        Extrakit extends Extra.AnyKit,
      >({
        toolkit,
        eventkit,
        metrickit,
        extrakit,
        metadata,
      }: {
        toolkit: Toolkit;
        eventkit: Eventkit;
        metrickit: Metrickit;
        extrakit: Extrakit;
        metadata: Trajectory.Metadata;
      }) =>
      <E, R>(bytes: Stream.Stream<Uint8Array, E, R>) => {
        const config = { stream: true as const, toolkit, eventkit, metrickit, extrakit };

        // The header line is what a file starts with, so reading it is what leaves the
        // frames behind for the parts to be read from. What it describes is what the
        // caller passes to read them with, so reading it here is only to pass it by.
        const parts = Stream.unwrap(
          bytes.pipe(
            Stream.peel(sink),
            Effect.map(([, frames]) => {
              const body = withoutDigest(frames);

              return body.pipe(compression.decompress, decodeParts(config));
            }),
          ),
        );

        return trajectoryOf(parts, config, metadata);
      },
  };
};
