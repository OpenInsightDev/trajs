/**
 * Exchanging a trajectory with what a program keeps it in.
 *
 * A trajectory is a stream of parts, and what a program stores it in — a file, a
 * database, a socket — carries bytes. {@link Exchange} is the seam between the
 * two: {@link Service.write} encodes a trajectory into the bytes of a recording,
 * {@link Service.metadata} reads back what those bytes say the recording was
 * made with, and {@link Service.read} decodes a recording into a trajectory. The
 * exchange is sans IO — it neither performs IO of its own nor asks for any — so
 * where the bytes are carried is the caller's to decide.
 *
 * What those bytes are is the layer's to say. {@link Exchange.layer} is the layer
 * this package ships — the format a `.trajs` file holds, described on the layer
 * itself — and a program that keeps recordings some other way provides a layer of
 * its own, which is the only thing that changes.
 */

import type { ZstdOptions } from "node:zlib";

import { Context, Effect, Layer, Pull, Schema, SchemaTransformation, Sink, Stream } from "effect";
import { Prompt } from "effect/ai";
import * as Arr from "effect/Array";
import { SchemaBinary } from "effect/encoding";

import * as Extension from "#/Extension.ts";
import type * as Extkit from "#/Extensionkit.ts";
import { compress, decompress } from "#/internal/zstd.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * What a recording states about itself, before any of its parts.
 *
 * **When to use**
 *
 * Use to read what a recording was made with before decoding any of its parts.
 *
 * **Details**
 *
 * The toolkit and the extension kit are carried as the descriptions
 * {@link Toolkit.encode} and the extension metadata produce, which is enough to
 * name the tools and extensions a recording refers to without their Effect
 * Schemas, and each is an arbitrary JSON object here: a reader carries on with
 * whatever the writer put in it.
 *
 * Where a recording carries it is the layer's to say, and
 * {@link Exchange.layer} says it for the one this package ships.
 *
 * @see {@link Service.metadata} for reading it back.
 * @category models
 */
export const Header = Schema.Struct({
  metadata: Trajectory.Metadata,
  toolkit: Schema.JsonObject,
  extkit: Schema.JsonObject,
});

export type Header = Schema.Schema.Type<typeof Header>;

const encodeHeader = ({
  extkit,
  toolkit,
  metadata,
}: {
  extkit: Extkit.Any;
  toolkit: Toolkit.Any;
  metadata: Trajectory.Metadata;
}): string =>
  JSON.stringify({
    metadata: Schema.encodeSync(Trajectory.Metadata)(metadata),
    toolkit: Toolkit.encode(toolkit),
    extkit: Object.fromEntries(
      Object.entries(extkit.extensions).map(([key, extension]: [string, Extension.Any]) => [
        key,
        {
          id: extension.id,
          metadata: Schema.encodeSync(Extension.Metadata)(extension.metadata),
        },
      ]),
    ),
  });

/** The byte a header line ends with. */
const Newline = 0x0a;

/** A header line as the JSON text a file carries it in. */
const HeaderLine = Schema.fromJsonString(Header);

/**
 * A sink that reads the header line a file starts with, leaving the frames that
 * follow it over for whatever reads them next.
 *
 * The newline ends the line wherever it fell, which is inside a chunk of bytes
 * rather than at its end, so the chunk it is in is cut and its tail left over
 * with the chunks pulled alongside it. Bytes that end before a newline, and a
 * line that is not a {@link Header}, fail as {@link TrajectoryError}.
 */
const HeaderSink: Sink.Sink<Header, Uint8Array, Uint8Array, TrajectoryError> = Sink.fromTransform(
  (upstream) =>
    Effect.gen(function* () {
      const decoder = new TextDecoder();
      let line = "";

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
            line += decoder.decode(chunk, { stream: true });
            continue;
          }

          line += decoder.decode(chunk.subarray(0, at));

          // What the newline did not end is a frame as much as the chunks pulled
          // with it are.
          const frames = [chunk.subarray(at + 1), ...chunks.slice(index + 1)].filter(
            (frame) => frame.length > 0,
          );

          const header = yield* Schema.decodeUnknownEffect(HeaderLine)(line).pipe(
            Effect.mapError(TrajectoryError.parse),
          );

          return [header, Arr.isReadonlyArrayNonEmpty(frames) ? frames : undefined];
        }
      }
    }),
);

/**
 * The exchange of a trajectory with the bytes a storage carries.
 *
 * **When to use**
 *
 * Use to encode a trajectory into the bytes of a recording, or to decode one
 * back, without naming the format those bytes are in.
 *
 * **Details**
 *
 * {@link Service.write} produces the bytes of a recording as the trajectory is
 * produced, {@link Service.metadata} reads back what a recording states about
 * itself, and {@link Service.read} turns the bytes of a recording into a
 * trajectory once the kit it was recorded with is in hand.
 *
 * What those bytes are is the layer's to say. An exchange carries no bytes of
 * its own, so what carries them is the caller's to choose. Reading is handed the
 * toolkit, the extension kit and the metadata a recording was made with, but not
 * the variant its parts were recorded with: any recording may be of any variant,
 * so reading assumes the most general one, {@link Trajectory.StreamVariant}, whose
 * responses are streams.
 *
 * Either direction fails with what the recording fails with — a part that cannot
 * be encoded or decoded, and bytes that do not decode — as
 * {@link TrajectoryError}, on top of the failures of what it reads: the
 * trajectory being written, or the bytes being read, as `E`, and the services
 * they need as `R`.
 *
 * @see {@link Exchange.layer} for the format this package ships.
 * @category models
 */

/**
 * The variant {@link Service.read} assumes: the most general one, as `effect/ai`
 * types it. A recording of another variant is not readable back.
 */
const GeneralVariant: Trajectory.StreamVariant = { ext: true, stream: true };

export interface Service {
  /** Encodes a trajectory into the bytes of a recording. */
  readonly write: <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
    trajectory: Trajectory.Trajectory<K, V, E, R>,
  ) => Stream.Stream<Uint8Array, E | TrajectoryError, R>;

  /**
   * Reads what a recording states about itself, leaving the bytes that follow it
   * over for {@link Service.read}.
   */
  readonly metadata: Sink.Sink<Header, Uint8Array, Uint8Array, TrajectoryError>;

  /** Decodes the bytes of a recording into a trajectory of the kit it is handed. */
  readonly read: <Toolkit extends Toolkit.Any, Extkit extends Extkit.Any>(options: {
    toolkit: Toolkit;
    extkit: Extkit;
    metadata: Trajectory.Metadata;
  }) => <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Trajectory.Trajectory<
    Trajectory.Kit<Toolkit, Extkit>,
    Trajectory.StreamVariant,
    E | TrajectoryError,
    R
  >;
}

/**
 * The service tag a trajectory is exchanged with bytes through.
 *
 * **When to use**
 *
 * Use to require an exchange of a program, and {@link Exchange.layer} to provide
 * the one this package ships.
 *
 * **Details**
 *
 * An effect written against this service takes whatever format the layer it is
 * provided with writes — nothing of a format is part of what an exchange
 * requires — so a program that keeps recordings some other way provides a layer
 * of its own and the code that exchanges them is unchanged.
 *
 * {@link Service.metadata} reads back what a recording was made with, and
 * {@link Service.read} reads one back; both take the bytes, so what carries them
 * is the caller's to choose, and reading hands back the trajectory the bytes
 * hold, so its parts are read as the bytes arrive rather than once they have
 * ended. What a recording states of itself is the header line, which
 * {@link Service.metadata} reads; {@link Service.read} is handed what to read the
 * parts with instead — the kit itself, rather than the names the header carries —
 * and the metadata the returned trajectory goes by.
 *
 * Either direction fails with the failures of what it reads — the bytes being
 * read, the trajectory being written — as `E` on top of the {@link TrajectoryError}
 * a part that cannot be encoded or decoded fails with, and requires the services
 * `R` names.
 *
 * @see {@link Service} for what an exchange is made of.
 * @see {@link Exchange.layer} for the format this package ships.
 * @see {@link Service.read} for the other direction.
 * @category services
 */
export class Exchange extends Context.Service<Exchange, Service>()("trajs/core/Exchange") {
  /**
   * Builds the exchange of the format this package ships: the bytes a `.trajs`
   * file holds.
   *
   * **When to use**
   *
   * Use when a program keeps recordings the way this package writes them, or
   * wants to set how their parts are compressed.
   *
   * **Details**
   *
   * Providing the layer touches no file and holds no resource: the layer is the
   * encoding and the decoding of the format, and the bytes it produces are the
   * caller's to carry.
   *
   * A recording starts with one plain-text line, the encoded {@link Header}, and
   * nothing before it is compressed, so the head of a file is readable — and its
   * toolkit and extension kit knowable — without anything else. Everything after
   * that line is one zstd frame carrying the trajectory's parts, each encoded as
   * one SchemaBinary frame ({@link Part}), so a recording is read as it arrives
   * rather than once it has ended.
   *
   * `zstd` is what the parts are compressed with, taken straight as `node:zlib`
   * takes it and defaulting to what zstd does; its level is the setting to reach
   * for, since the levels around the default 3 trade size for time either way.
   * The bytes the zstd stream refuses are the recording's, so they fail as a
   * {@link TrajectoryError} like any other part of the format; an option
   * `node:zlib` refuses is a defect of the call rather than a failure of the
   * exchange.
   *
   * **Example** (Setting how the parts are compressed)
   *
   * ```ts import.meta.vitest
   * const layer = Exchange.layer({ chunkSize: 64 * 1024 })
   * ```
   *
   * @see {@link Service} for the exchange the layer provides.
   * @category constructors
   */
  static readonly layer = (options?: ZstdOptions): Layer.Layer<Exchange> =>
    Layer.succeed(Exchange, {
      metadata: HeaderSink,
      write: (trajectory) => {
        const { kit, variant, metadata } = trajectory;

        const header = encodeHeader({
          extkit: kit.ext,
          toolkit: kit.tool,
          metadata: metadata,
        });

        const parts = trajectory.pipe(
          Stream.mapEffect(encodePart(kit, variant)),
          compress(options),
          // The zstd stream refusing the bytes is the recording failing to be
          // written, which is what an exchange reports, rather than a failure of
          // the service that a layer of another format would have to answer for.
          Stream.catchTag("CompressFailed", (cause) => Stream.fail(TrajectoryError.parse(cause))),
        );

        return Stream.concat(Stream.make(new TextEncoder().encode(`${header}\n`)), parts);
      },
      read:
        <Toolkit extends Toolkit.Any, Extkit extends Extkit.Any>({
          toolkit,
          extkit,
          metadata,
        }: {
          toolkit: Toolkit;
          extkit: Extkit;
          metadata: Trajectory.Metadata;
        }) =>
        <E, R>(bytes: Stream.Stream<Uint8Array, E, R>) => {
          const kit = { tool: toolkit, ext: extkit };

          // The header line is what a file starts with, so reading it is what
          // leaves the frames behind for the parts to be read from. What it
          // describes is what the caller passes to read them with, so reading
          // it here is only to pass it by.
          const parts = Stream.unwrap(
            bytes.pipe(
              Stream.peel(HeaderSink),
              Effect.map(([, frames]) =>
                frames.pipe(
                  decompress,
                  // The zstd stream refusing the bytes is the recording failing to
                  // be read, which is what an exchange reports, rather than a
                  // failure of the service that a layer of another format would
                  // have to answer for.
                  Stream.catchTag("CompressFailed", (cause) =>
                    Stream.fail(TrajectoryError.parse(cause)),
                  ),
                  decodeParts(kit, GeneralVariant),
                ),
              ),
            ),
          );

          return Trajectory.make(parts, kit, GeneralVariant, metadata);
        },
    });
}

/**
 * The parts the frames of a body carry, as a stream.
 *
 * A part is one frame, and a frame can span chunks or share one with the frames
 * around it, so the body is fed to one parser as it arrives: the parts come out
 * in the order they were recorded, and a body that ends in the middle of a
 * frame fails as {@link TrajectoryError} rather than losing the part. The
 * parser belongs to a run, since it is the state one body is read with.
 */
const decodeParts =
  <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant>(kit: K, variant: V) =>
  <E, R>(
    body: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<Trajectory.Part<K, V>, E | TrajectoryError, R> =>
    Stream.suspend(() => {
      const parser = SchemaBinary.parser(Part(kit, variant));

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
const PromptPartTagged = Trajectory.PromptPart.mapFields((fields) => ({
  ...fields,
  messages: Messages,
}));

/** The part schemas as the members of the union they are. */
type PartMembers<K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant> = ReadonlyArray<
  Schema.Codec<Trajectory.Part<K, V>, Trajectory.PartEncoded, never, never>
>;

/**
 * The parts of a trajectory as the binary frames of the format this package
 * ships carry them.
 *
 * **When to use**
 *
 * Use to read the parts of a recording this package wrote, or to write the parts
 * of a recording of your own in that format.
 *
 * **Details**
 *
 * It is {@link Trajectory.Part} with a prompt part's messages carrying their
 * file data tagged — see above for why a binary layout cannot carry the data as
 * it is — and every other part of the trajectory keeping its own layout. A layer
 * of another format states its own parts as it likes and has no use for this one.
 *
 * @see {@link Exchange.layer} for the format these frames belong to.
 * @category models
 */
export const Part = <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant>(
  kit: K,
  variant: V,
) => {
  // SAFETY: `Trajectory.Part` is a `Schema.Union` at run time, and its members
  // are these part schemas, none of which needs a service; its signature widens
  // both away, and `mapMembers` is the union's own combinator.
  const parts = Trajectory.Part(kit, variant) as Schema.Union<PartMembers<K, V>>;

  return parts.mapMembers((members) =>
    members.map((member) => (member === Trajectory.PromptPart ? PromptPartTagged : member)),
  );
};

/**
 * Encodes one part of a trajectory as a SchemaBinary frame.
 *
 * The schema is the one the trajectory's own kit and variant describe —
 * {@link Part} — so a part recorded against a tool the kit no longer holds still
 * encodes as the unrestricted part it was recorded as.
 */
const encodePart = <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant>(
  kit: K,
  variant: V,
) => {
  const encode = Schema.encodeEffect(SchemaBinary.toCodec(Part(kit, variant)));

  return (part: Trajectory.Part<K, V>): Effect.Effect<Uint8Array, TrajectoryError> =>
    encode(part).pipe(
      Effect.mapError((cause) => TrajectoryError.parse(cause)),
      // Frames may be views into one arena that the next encode reuses, and the
      // compressor holds a chunk until it has written it.
      Effect.map((frame) => frame.slice()),
    );
};
