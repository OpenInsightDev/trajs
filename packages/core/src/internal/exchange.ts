import type { Bytes } from "@trajs/utils/Bytes";
import type { CompressionError } from "@trajs/utils/Compression";
import type { StorageError } from "@trajs/utils/Storage";
import { Effect, Schema, SchemaTransformation, Stream } from "effect";
import { SchemaBinary } from "effect/encoding";

import type * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import type { Header, Metadata } from "#/Exchange.ts";
import type * as ExtraKit from "#/ExtraKit.ts";
import { foldParts } from "#/internal/folding.ts";
import { readFrames } from "#/internal/frames.ts";
import * as Metric from "#/Metric.ts";
import * as Prompt from "#/Prompt.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

// HACK: `effect/ai` types a file part's data as `string | Uint8Array | URL`, and
// a `URL` encodes as a string the way any other does, so SchemaBinary rejects it.
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

const FilePart = Prompt.FilePart.mapFields((fields) => ({ ...fields, data: FilePartData }));

const UserParts = Prompt.UserMessagePart.mapMembers((members) =>
  members.map((member) => (member === Prompt.FilePart ? FilePart : member)),
);

const AssistantParts = Prompt.AssistantMessagePart.mapMembers((members) =>
  members.map((member) => (member === Prompt.FilePart ? FilePart : member)),
);

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

const PromptPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Trajectory.PromptPart(extrakit).mapFields((fields) => ({ ...fields, messages: Messages }));

export const ExchangePart = <C extends Config.AnyConfig>(config: C) =>
  Schema.Union([
    PromptPart<C["extrakit"]>(config.extrakit),
    Trajectory.SessionPart<C["extrakit"]>(config.extrakit),
    Trajectory.ResponsePart<C["toolkit"], C["extrakit"], true>({
      toolkit: config.toolkit,
      extrakit: config.extrakit,
      stream: true,
    }),
    Trajectory.EventPart<C["eventkit"]>(config.eventkit),
    Trajectory.MetricPart<C["metrickit"]>(config.metrickit),
  ]);

type Part<C extends Config.AnyConfig> = Schema.Schema.Type<ReturnType<typeof ExchangePart<C>>>;

/** Encodes one trajectory part as a {@link SchemaBinary} frame. */
export const encodePart = <C extends Config.AnyConfig>(config: C) => {
  const encode = ExchangePart(config).pipe(SchemaBinary.toCodec, Schema.encodeEffect);

  return (part: Part<C>) =>
    encode(part).pipe(
      Effect.mapError((cause) => TrajectoryError.parse(cause)),
      Effect.map((frame) => frame.slice()),
    );
};

/** Decodes one trajectory part from the frame {@link encodePart} wrote. */
export const decodePart = <C extends Config.AnyConfig>(config: C) => {
  const decode = ExchangePart(config).pipe(SchemaBinary.toCodec, Schema.decodeUnknownEffect);

  return (bytes: Uint8Array) =>
    decode(bytes).pipe(Effect.mapError((cause) => TrajectoryError.parse(cause)));
};

/** How many bytes state the length of the header and of the metadata: four, big-endian. */
const LengthBytes = 4;

const encodeLength = (length: number): Uint8Array => {
  const bytes = new Uint8Array(LengthBytes);

  new DataView(bytes.buffer).setUint32(0, length, false);

  return bytes;
};

const decodeLength = (bytes: Uint8Array): number | undefined =>
  bytes.length < LengthBytes
    ? undefined
    : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);

export const lengthPrefixed = (body: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(LengthBytes + body.length);

  bytes.set(encodeLength(body.length));
  bytes.set(body, LengthBytes);

  return bytes;
};

const isMagic = (magic: Uint8Array, bytes: Uint8Array): boolean =>
  bytes.length === magic.length && magic.every((byte, at) => bytes[at] === byte);

/** The header a trajectory states, as the JSON text it starts with. */
export const encodeHeader = (config: Config.AnyConfig): string =>
  JSON.stringify({
    toolkit: Toolkit.encode(config.toolkit),
    eventkit: Object.fromEntries(
      Object.entries(config.eventkit.events).map(([tag, event]) => [
        tag,
        Schema.encodeSync(Event.Metadata)(event.metadata),
      ]),
    ),
    metrickit: Object.fromEntries(
      Object.entries(config.metrickit.metrics).map(([tag, metric]) => [
        tag,
        Schema.encodeSync(Metric.Metadata)(metric.metadata),
      ]),
    ),
    extrakit: Object.fromEntries(
      Object.entries(config.extrakit.extra).map(([tag, extra]) => [
        tag,
        { name: extra.name, description: extra.description },
      ]),
    ),
  });

/** The header a trajectory starts with, and where its parts begin. */
interface Stated {
  readonly header: Header;
  readonly end: bigint;
}

export const headerOf = <S extends Schema.ConstraintCodec<Header, unknown, never, never>>(
  header: S,
  bytes: Bytes<StorageError>,
): Effect.Effect<Stated, TrajectoryError | StorageError> => {
  const stated = Schema.fromJsonString(header);

  return Effect.gen(function* () {
    const prefix = yield* bytes.readAlloc({ offset: 0n, size: LengthBytes });
    const size = decodeLength(prefix);

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

/** The metadata a trajectory ends with, and where its parts end. */
interface Trailing {
  readonly metadata: Metadata;
  readonly end: bigint;
}

export const trailingOf = <S extends Schema.ConstraintCodec<Metadata, unknown, never, never>>(
  metadata: S,
  magic: Uint8Array,
  bytes: Bytes<StorageError>,
): Effect.Effect<Trailing, TrajectoryError | StorageError> => {
  const stated = Schema.fromJsonString(metadata);

  return Effect.gen(function* () {
    const length = yield* bytes.length;
    const trailer = LengthBytes + magic.length;

    const tail =
      length < BigInt(trailer)
        ? new Uint8Array()
        : yield* bytes.readAlloc({ offset: length - BigInt(trailer), size: trailer });

    const size = decodeLength(tail);

    if (
      size === undefined ||
      !isMagic(magic, tail.subarray(LengthBytes)) ||
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

export const encodeTrailing = <S extends Schema.ConstraintCodec<Metadata, unknown, never, never>>(
  metadata: S,
  magic: Uint8Array,
  stated: Metadata,
): Uint8Array => {
  const json = new TextEncoder().encode(Schema.encodeSync(Schema.fromJsonString(metadata))(stated));
  const bytes = new Uint8Array(json.length + LengthBytes + magic.length);

  bytes.set(json);
  bytes.set(encodeLength(json.length), json.length);
  bytes.set(magic, json.length + LengthBytes);

  return bytes;
};

const FrameChunk = 64 * 1024;

/** The bytes of the frame the parts are carried in, from `from` to `to`. */
export const framesOf =
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
          Effect.map((chunk) =>
            chunk.length === 0 ? undefined : ([chunk, offset + BigInt(chunk.length)] as const),
          ),
        );
    });

export const framed = <E, R>(
  bytes: Stream.Stream<Uint8Array, E | CompressionError, R>,
): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
  bytes.pipe(
    Stream.catchTag("CompressionError", (cause) => Stream.fail(TrajectoryError.parse(cause))),
  );

const readable = <C extends Config.AnyConfig>(
  config: C,
): Schema.ConstraintDecoder<Trajectory.Part<C>> =>
  // SAFETY: a trajectory is read from its bytes rather than run, so reading a part takes no service.
  ExchangePart(config) as Schema.ConstraintDecoder<Trajectory.Part<C>>;

export const reading = <C extends Config.AnyConfig, E>(
  bytes: Stream.Stream<Uint8Array, E, never>,
  config: C,
): Trajectory.Trajectory<string, C, E | TrajectoryError, never> => {
  const parts = readFrames(readable(config))(bytes);

  // SAFETY: the parts of a non-streaming reading are the whole parts of the parts it folds.
  const read = (config.stream ? parts : foldParts(parts)) as Stream.Stream<
    Trajectory.Part<C>,
    E | TrajectoryError,
    never
  >;

  return Trajectory.make(config)(read);
};

export const configOf = <C extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, C, E, R>,
): C =>
  // SAFETY: every field a config states is read off the trajectory, which carries one.
  ({
    stream: trajectory.stream,
    toolkit: trajectory.toolkit,
    eventkit: trajectory.eventkit,
    metrickit: trajectory.metrickit,
    extrakit: trajectory.extrakit,
  }) as C;
