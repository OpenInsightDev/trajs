import type { Byte } from "@trajs/utils/Byte";
import type { StorageError } from "@trajs/utils/Storage";
import { Effect, Schema, SchemaTransformation, Stream } from "effect";
import { SchemaBinary } from "effect/encoding";

import type * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import type * as Exchange from "#/Exchange.ts";
import type * as ExtraKit from "#/ExtraKit.ts";
import { readFrames } from "#/internal/frames.ts";
import * as Metric from "#/Metric.ts";
import { PackageMetadata } from "#/PackageMetadata.ts";
import * as Prompt from "#/Prompt.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

// HACK: `effect/ai` types file-part data as `string | Uint8Array | URL`.
// SchemaBinary rejects `URL`, so a URL is encoded as `{ url }`.
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

const exchangePart = <C extends Config.AnyConfig>(config: C) =>
  Schema.Union([
    PromptPart<C["extrakit"]>(config.extrakit),
    Trajectory.SessionPart<C["extrakit"]>(config.extrakit),
    Trajectory.ResponsePart({ toolkit: config.toolkit, extrakit: config.extrakit }),
    Trajectory.EventPart<C["eventkit"]>(config.eventkit),
    Trajectory.MetricPart<C["metrickit"]>(config.metrickit),
  ]);

type PartEncoded<C extends Config.AnyConfig> = Schema.Codec.Encoded<
  ReturnType<typeof exchangePart<C>>
>;

export const ExchangePart = <C extends Config.AnyConfig>(
  config: C,
): Schema.Codec<
  Trajectory.Part<C>,
  PartEncoded<C>,
  Config.DecodingServices<C>,
  Config.EncodingServices<C>
> =>
  // SAFETY: the exchange's schemas are the config's own, so the config's services cover them.
  // The prompt schema differs only in accepting a file a store states as a URL, which
  // decodes to the same file data.
  // Effect omits tool parameter services from response part types; see
  // https://github.com/Effect-TS/effect/issues/9867.
  exchangePart(config) as Schema.Codec<
    Trajectory.Part<C>,
    PartEncoded<C>,
    Config.DecodingServices<C>,
    Config.EncodingServices<C>
  >;

export const encodePart = <C extends Config.AnyConfig>(config: C) => {
  const encode = ExchangePart(config).pipe(SchemaBinary.toCodec, Schema.encodeEffect);

  return (part: Trajectory.Part<C>) =>
    encode(part).pipe(
      Effect.mapError((cause) => TrajectoryError.parse(cause)),
      Effect.map((frame) => frame.slice()),
    );
};

export const decodePart = <C extends Config.AnyConfig>(config: C) => {
  const decode = ExchangePart(config).pipe(SchemaBinary.toCodec, Schema.decodeUnknownEffect);

  return (bytes: Uint8Array) =>
    decode(bytes).pipe(Effect.mapError((cause) => TrajectoryError.parse(cause)));
};

/** Big-endian length of the header and of the metadata, in bytes. */
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

const lengthPrefixed = (body: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(LengthBytes + body.length);

  bytes.set(encodeLength(body.length));
  bytes.set(body, LengthBytes);

  return bytes;
};

const isMagic = (magic: Uint8Array, bytes: Uint8Array): boolean =>
  bytes.length === magic.length && magic.every((byte, at) => bytes[at] === byte);

const decodeJson = <A>(
  schema: Schema.ConstraintCodec<A, unknown, never, never>,
  bytes: Uint8Array,
) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(new TextDecoder().decode(bytes)).pipe(
    Effect.mapError(TrajectoryError.parse),
  );

const encodedPackageMetadata = (
  packageMetadata: PackageMetadata | undefined,
): Schema.Codec.Encoded<typeof PackageMetadata> | undefined =>
  packageMetadata === undefined ? undefined : Schema.encodeSync(PackageMetadata)(packageMetadata);

export const encodeHeader = (config: Config.AnyConfig): Uint8Array => {
  const json = JSON.stringify({
    toolkit: Toolkit.encode(config.toolkit),
    eventkit: Object.fromEntries(
      Object.entries(config.eventkit.events).map(([tag, event]) => [
        tag,
        {
          metadata: Schema.encodeSync(Event.Metadata)(event.metadata),
          packageMetadata: encodedPackageMetadata(event.packageMetadata),
        },
      ]),
    ),
    metrickit: Object.fromEntries(
      Object.entries(config.metrickit.metrics).map(([tag, metric]) => [
        tag,
        {
          metadata: Schema.encodeSync(Metric.Metadata)(metric.metadata),
          packageMetadata: encodedPackageMetadata(metric.packageMetadata),
        },
      ]),
    ),
    extrakit: Object.fromEntries(
      Object.entries(config.extrakit.extra).map(([tag, extra]) => [
        tag,
        {
          metadata: { name: extra.name, description: extra.description },
          packageMetadata: encodedPackageMetadata(extra.packageMetadata),
        },
      ]),
    ),
  });

  return lengthPrefixed(new TextEncoder().encode(json));
};

export const headerOf = (
  header: Schema.ConstraintCodec<Exchange.Header, unknown, never, never>,
  bytes: Byte<StorageError>,
): Effect.Effect<
  { readonly header: Exchange.Header; readonly end: bigint },
  TrajectoryError | StorageError
> =>
  Effect.gen(function* () {
    const prefix = yield* bytes.readAlloc({ offset: 0n, size: LengthBytes });
    const size = decodeLength(prefix);

    if (size === undefined) {
      return yield* Effect.fail(TrajectoryError.parse("the bytes end before a header length"));
    }

    const headerBytes = yield* bytes.readAlloc({ offset: BigInt(LengthBytes), size });

    if (headerBytes.length < size) {
      return yield* Effect.fail(TrajectoryError.parse("the bytes end before a header"));
    }

    return {
      header: yield* decodeJson(header, headerBytes),
      end: BigInt(LengthBytes + size),
    };
  });

export const metadataOf = (
  metadata: Schema.ConstraintCodec<Exchange.Metadata, unknown, never, never>,
  magic: Uint8Array,
  bytes: Byte<StorageError>,
): Effect.Effect<
  { readonly metadata: Exchange.Metadata; readonly end: bigint },
  TrajectoryError | StorageError
> =>
  Effect.gen(function* () {
    const length = yield* bytes.length;
    const tailSize = LengthBytes + magic.length;

    const tail =
      length < BigInt(tailSize)
        ? new Uint8Array()
        : yield* bytes.readAlloc({ offset: length - BigInt(tailSize), size: tailSize });

    const size = decodeLength(tail);

    if (
      size === undefined ||
      !isMagic(magic, tail.subarray(LengthBytes)) ||
      BigInt(size) > length - BigInt(tailSize)
    ) {
      return yield* Effect.fail(
        TrajectoryError.parse("the bytes do not end with the metadata of a trajectory"),
      );
    }

    const start = length - BigInt(tailSize) - BigInt(size);
    const metadataBytes = yield* bytes.readAlloc({ offset: start, size });

    return {
      metadata: yield* decodeJson(metadata, metadataBytes),
      end: start,
    };
  });

export const encodeMetadata = (
  schema: Schema.ConstraintCodec<Exchange.Metadata, unknown, never, never>,
  magic: Uint8Array,
  metadata: Exchange.Metadata,
): Uint8Array => {
  const json = new TextEncoder().encode(Schema.encodeSync(Schema.fromJsonString(schema))(metadata));
  const bytes = new Uint8Array(json.length + LengthBytes + magic.length);

  bytes.set(json);
  bytes.set(encodeLength(json.length), json.length);
  bytes.set(magic, json.length + LengthBytes);

  return bytes;
};

const FrameChunk = 64 * 1024;

export const frameOf =
  <E>({ from, to }: { readonly from: bigint; readonly to: bigint }) =>
  (bytes: Byte<E>): Stream.Stream<Uint8Array, E> =>
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

export const trajectoryOf = <C extends Config.AnyConfig, E>(
  bytes: Stream.Stream<Uint8Array, E, never>,
  config: C,
): Trajectory.Trajectory<string, C, E | TrajectoryError, Config.DecodingServices<C>> =>
  Trajectory.make(config)(readFrames(ExchangePart(config))(bytes));
