import { Effect, Schema, SchemaTransformation } from "effect";
import { SchemaBinary } from "effect/encoding";

import type * as Config from "#/Config.ts";
import type * as ExtraKit from "#/ExtraKit.ts";
import * as Prompt from "#/Prompt.ts";
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
