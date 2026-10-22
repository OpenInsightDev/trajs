/**
 * The parts of a trajectory as the bytes they are carried in: the schema one part is written
 * and read as, and the two directions of a body of them.
 *
 * A part is not written as the schema it was produced with: a trajectory is read as the most
 * general one, whatever the kits its parts were produced with — see {@link part} — so one
 * schema carries the parts of any trajectory of a config. What keeps the parts of a body apart
 * is the frame each is wrapped in ({@link SchemaBinary}), which states the length of what
 * follows it before anything else, so a frame the schema does not read is stepped over rather
 * than failing the reading.
 *
 * The bytes are what both readings of what a trajectory holds are of: the exchange format this
 * package ships keeps a trajectory as the frames of its parts, and the sessions of a trajectory
 * are read out of the same frames kept in a store of bytes ({@link Trajectory.toSessions}).
 *
 * Nothing here is published: a program reaches the bytes through `Exchange` and
 * `Trajectory.toSessions`.
 */

import { Effect, Option, Schema, SchemaTransformation, Stream } from "effect";
import { SchemaBinary } from "effect/encoding";

import type * as ExtraKit from "#/ExtraKit.ts";
import { foldParts } from "#/internal/folding.ts";
import { readFrames } from "#/internal/frames.ts";
import { uuid } from "#/internal/trajectory.ts";
import * as Prompt from "#/Prompt.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The parts of a trajectory as a reading of one has them: the same parts, read with no service of
 * their own ({@link Readable}).
 *
 * A reading of a trajectory takes no service, and what the parts of a config of unknown kits
 * state is not knowable, so they are read as ones that take none rather than shown to be.
 */
const asReadable = <A, I, E>(parts: Schema.Codec<A, I, unknown, E>): Schema.Codec<A, I, never, E> =>
  // SAFETY: a trajectory is read from its bytes synchronously rather than run, so a reading
  // of one takes no service: what a schema states of reading a part is not carried by one,
  // and what it states of writing one is kept as it is.
  parts as Schema.Codec<A, I, never, E>;

/** The part schemas {@link part} builds, in the order a trajectory states them. */
export type PartMembers<C extends Trajectory.AnyConfig> = readonly [
  ReturnType<typeof PromptPartTagged<C["extrakit"]>>,
  ReturnType<typeof Trajectory.SessionPart<C["extrakit"]>>,
  ReturnType<typeof Trajectory.ResponsePart<C["toolkit"], C["extrakit"], true>>,
  ReturnType<typeof Trajectory.EventPart<C["eventkit"]>>,
  ReturnType<typeof Trajectory.MetricPart<C["metrickit"]>>,
];

// HACK: which parts a config states a service for is computed rather than declared, so it
// cannot be a constraint of the config: a config that states one fails it by a marker it
// does not state instead. What such a config is refused with is `readable` rather than the
// part that states the service, which is a message only the doc below explains.
/**
 * A config a trajectory's parts are read as: one whose parts take no service to read, since
 * they are read from bytes synchronously rather than run ({@link Exchange.Loaded.read},
 * {@link Trajectory.toSessions}).
 *
 * A part is read as the plain schemas a trajectory is rebuilt from, so what a kit states
 * of its contributions is read with no service; a response part is the one part read
 * through the toolkit's own schemas, so a toolkit whose own schemas need a service to read
 * a result of one of its tools is not one a trajectory is read with.
 */
export type Readable<C extends Trajectory.AnyConfig> = C &
  (Schema.Union<PartMembers<C>>["DecodingServices"] extends never
    ? unknown
    : { readonly readable: never });

/** The part a trajectory holds, as the bytes of one carry it. */
type ProducedPart<C extends Trajectory.AnyConfig> = Schema.Union<PartMembers<C>>["Type"];

/**
 * The services encoding the parts of a config's trajectory takes, as the part schemas of
 * that config state them.
 *
 * It is what {@link part} states of writing a part: a response part is written through the
 * schemas of the toolkit it was produced with, and no other part states a service, since the
 * parts are rebuilt from the plain schemas of `effect/ai` and of `@trajs/core`.
 */
export type EncodingServices<C extends Trajectory.AnyConfig> = Schema.Union<
  PartMembers<C>
>["EncodingServices"];

/**
 * The parts of a trajectory as the frames a body carries them in.
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
    PromptPartTagged<C["extrakit"]>(config.extrakit),
    Trajectory.SessionPart<C["extrakit"]>(config.extrakit),
    // What a trajectory is read as, whatever it was written as.
    Trajectory.ResponsePart<C["toolkit"], C["extrakit"], true>({
      toolkit: config.toolkit,
      extrakit: config.extrakit,
      stream: true,
    }),
    Trajectory.EventPart<C["eventkit"]>(config.eventkit),
    Trajectory.MetricPart<C["metrickit"]>(config.metrickit),
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
export const encodePart = <C extends Trajectory.AnyConfig>(config: C) => {
  const encode = part(config).pipe(SchemaBinary.toCodec, Schema.encodeEffect);

  return (part: ProducedPart<C>): Effect.Effect<Uint8Array, TrajectoryError, EncodingServices<C>> =>
    encode(part).pipe(
      Effect.mapError((cause) => TrajectoryError.parse(cause)),
      // Frames may be views into one arena that the next encode reuses, and the
      // compressor holds a chunk until it has written it.
      Effect.map((frame) => frame.slice()),
    );
};

/**
 * Reads one part of a trajectory out of the frame {@link encodePart} wrote it as: the direction
 * a part a share keeps in a store is read back in.
 *
 * The bytes are read as the frames they are, so a frame the schema does not read is no part of
 * a trajectory and the reading fails rather than yielding none: what a store keeps is the one
 * part it was given, and a reading of it that yields nothing has lost that part.
 */
export const decodePart = <C extends Trajectory.AnyConfig>(config: C) => {
  const parts = asReadable(part(config));
  const read = readFrames(parts);

  return <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ): Effect.Effect<Trajectory.Part<C>, E | TrajectoryError, R> =>
    // SAFETY: a trajectory is carried as the most general one — its response parts are the
    // streams they arrived in — and the parts of any other variant are members of those, so
    // what the schema reads is a part of the trajectory it is read with.
    read(bytes).pipe(
      Stream.runHead,
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(TrajectoryError.parse("the bytes hold no part")),
          onSome: (part) => Effect.succeed(part),
        }),
      ),
    ) as Effect.Effect<Trajectory.Part<C>, E | TrajectoryError, R>;
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
const PromptPartTagged = <K extends ExtraKit.Any>(extrakit: K) =>
  Trajectory.PromptPart(extrakit).mapFields((fields) => ({ ...fields, messages: Messages }));

/**
 * What a trajectory states of itself, as the config its parts are read and written with.
 *
 * A config is what a trajectory is stated with, so what one holds is read off the trajectory
 * rather than declared beside it.
 */
export const configOf = <C extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, C, E, R>,
) => ({
  stream: trajectory.stream,
  toolkit: trajectory.toolkit,
  eventkit: trajectory.eventkit,
  metrickit: trajectory.metrickit,
  extrakit: trajectory.extrakit,
});

/**
 * A reading of the parts of a trajectory, curried out of the bytes a body carries them in: the
 * frame a storage serves, the frame a store keeps and the parts a session is read from are the
 * same bytes of the same trajectory, so what reads them differs in those alone.
 *
 * The trajectory a reading makes is named by the id given, or by a new uuid where none is: what
 * a storage keeps a trajectory under is where it is kept ({@link Exchange.Service.load}), not what
 * the trajectory it holds is named.
 */
export const reading =
  <E, R>(bytes: Stream.Stream<Uint8Array, E, R>, id: string = uuid()) =>
  // SAFETY: reading with no config is reading with the kits that name nothing, which
  // is what `Trajectory.anyConfig` is.
  <C extends Trajectory.AnyConfig = Trajectory.AnyConfig>(
    config: C = Trajectory.anyConfig as C,
  ): Trajectory.Trajectory<string, C, E | TrajectoryError, R> => {
    const parts = asReadable(part(config));
    const frames = readFrames(parts);
    // SAFETY: what a body reads as is the parts of the config it is read with, which is
    // what the trajectory those parts make holds.
    const read = bytes.pipe(frames) as Stream.Stream<Trajectory.Part<C>, E | TrajectoryError, R>;

    // A config whose response parts are whole asks for the parts a model returned, and
    // the bytes carry the increments they arrived in as well as those parts, since a
    // trajectory is stated as the most general one whatever the config says of itself
    // ({@link part}). So what such a reading yields is those increments folded into the
    // parts they complete, which is what `folding.ts`'s `foldParts` does.
    //
    // SAFETY: a folded part is a whole one — `foldParts` states that of its own result —
    // and the whole parts are what a config that states `stream` off holds, which is the
    // config read with here.
    return Trajectory.make(
      id,
      config,
    )(
      (config.stream ? read : foldParts(read)) as Stream.Stream<
        Trajectory.Part<C>,
        E | TrajectoryError,
        R
      >,
    );
  };
