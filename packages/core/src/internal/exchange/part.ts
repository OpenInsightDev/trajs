import { Effect, Match, Schema, SchemaGetter } from "effect";
import type { NonEmptyReadonlyArray } from "effect/Array";

import * as Event from "#/Event.ts";
import type * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import type * as ExtraKit from "#/ExtraKit.ts";
import { TimestampInt, UuidFromByte } from "#/internal/schema.ts";
import * as Metric from "#/Metric.ts";
import type * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import type * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";

// One tagged struct per kind, in the spellings a chunk holds them. Keeping the
// tag lets one union codec read every kind.

// An extra read as `Schema.Unknown` would store bytes and moments as JSON text.
const extraField = <K extends ExtraKit.Any, P extends Extra.Part>(extrakit: K, part: P) =>
  Extra.ExtraRecord(extrakit, part).pipe(Schema.withDecodingDefault(Effect.succeed({})));

export interface PromptPartMetaEncoded {
  _tag: "Prompt";
  uuid: Uint8Array;
  sessionId?: string;
  timestamp?: number;
  startTimestamp?: number;
}

export interface PromptPartBodyEncoded {
  messages: Prompt.MessageEncoded[];
  extra?: Extra.ExtraRecordEncoded<ExtraKit.Extras<ExtraKit.Any>, "prompt">;
}

export const PromptPart = <K extends ExtraKit.Any>(
  extrakit: K,
): Schema.Codec<Trajectory.PromptPart<K>, PromptPartMetaEncoded & PromptPartBodyEncoded> =>
  Schema.TaggedStruct("Prompt", {
    uuid: UuidFromByte,
    sessionId: Schema.optional(Schema.String),
    timestamp: Schema.optional(TimestampInt),
    startTimestamp: Schema.optional(TimestampInt),
    messages: Prompt.Message.pipe(Schema.Array, Schema.mutable),
    extra: extraField(extrakit, "prompt"),
  }).annotate({ identifier: "PromptPart" });

export interface SessionPartMetaEncoded {
  _tag: "Session";
  uuid: Uint8Array;
  type: { _tag: "main" } | { _tag: "sub"; id: string; fork: Uint8Array };
}

export interface SessionPartBodyEncoded {
  extra?: Extra.ExtraRecordEncoded<ExtraKit.Extras<ExtraKit.Any>, "session">;
}

const MainSessionEncoded = Schema.TaggedStruct("main", {});

const SubSessionEncoded = Schema.TaggedStruct("sub", { id: Schema.String, fork: UuidFromByte });

// A stored main holds no id, because the id is the constant `"main"`. A stored
// sub holds its fork as 16 bytes, so decoding states the declaration's type.
const SessionType = Schema.Union([MainSessionEncoded, SubSessionEncoded]).pipe(
  Schema.decodeTo(Trajectory.SessionMeta.fields.type, {
    decode: SchemaGetter.transform((stored) =>
      Match.value(stored).pipe(
        Match.tag("main", () => ({ ...Trajectory.mainSession })),
        Match.tag("sub", (sub) => Trajectory.subSession(sub.id, { fork: sub.fork })),
        Match.exhaustive,
      ),
    ),
    encode: SchemaGetter.transform((session) =>
      Match.value(session).pipe(
        Match.tag("main", () => MainSessionEncoded.make({})),
        Match.tag("sub", (sub) => SubSessionEncoded.make({ id: sub.id, fork: sub.fork })),
        Match.exhaustive,
      ),
    ),
  }),
);

export const SessionPart = <K extends ExtraKit.Any>(
  extrakit: K,
): Schema.Codec<Trajectory.SessionPart<K>, SessionPartMetaEncoded & SessionPartBodyEncoded> =>
  Schema.TaggedStruct("Session", {
    uuid: UuidFromByte,
    type: SessionType,
    extra: extraField(extrakit, "session"),
  }).annotate({ identifier: "SessionPart" });

export interface ResponsePartMetaEncoded {
  _tag: "Response";
  uuid: Uint8Array;
  sessionId?: string;
  timestamp: number;
  startTimestamp?: number;
}

export interface ResponsePartBodyEncoded {
  response: Response.PartEncoded;
  extra?: Extra.ExtraRecordEncoded<ExtraKit.Extras<ExtraKit.Any>, "response">;
}

// A response may name a tool the toolkit does not declare, so any tool's parts
// are stated too.
const responsePartsOf = <T extends Toolkit.Any>(toolkit: T) =>
  Schema.Union([Response.Part(toolkit), Response.Part()]);

type ResponsePartsOf<T extends Toolkit.Any> = ReturnType<typeof responsePartsOf<T>>;

export const ResponsePart = <T extends Toolkit.Any, K extends ExtraKit.Any>(
  toolkit: T,
  extrakit: K,
): Schema.Codec<
  Trajectory.ResponsePart<T, K>,
  ResponsePartMetaEncoded & ResponsePartBodyEncoded,
  Schema.Codec.DecodingServices<ResponsePartsOf<T>>,
  Schema.Codec.EncodingServices<ResponsePartsOf<T>>
> =>
  Schema.TaggedStruct("Response", {
    uuid: UuidFromByte,
    sessionId: Schema.optional(Schema.String),
    timestamp: TimestampInt,
    startTimestamp: Schema.optional(TimestampInt),
    response: responsePartsOf(toolkit),
    extra: extraField(extrakit, "response"),
  }).annotate({ identifier: "ResponsePart" });

export interface EventPartMetaEncoded {
  _tag: "Event";
  uuid: Uint8Array;
  sessionId?: string;
  timestamp: number;
  startTimestamp?: number;
}

// The kit reads a payload, so the encoded side states no type for it.
export interface EventPartBodyEncoded {
  event: { _tag: string; data: unknown };
}

export const EventPart = <K extends EventKit.Any>(
  eventkit: K,
): Schema.Codec<
  Trajectory.EventPart<K>,
  EventPartMetaEncoded & EventPartBodyEncoded,
  Schema.Codec.DecodingServices<ReturnType<typeof Event.EventParts<K>>>,
  Schema.Codec.EncodingServices<ReturnType<typeof Event.EventParts<K>>>
> =>
  Schema.TaggedStruct("Event", {
    uuid: UuidFromByte,
    sessionId: Schema.optional(Schema.String),
    timestamp: TimestampInt,
    startTimestamp: Schema.optional(TimestampInt),
    event: Event.EventParts(eventkit),
  }).annotate({ identifier: "EventPart" });

export interface MetricPartMetaEncoded {
  _tag: "Metric";
  metricTag: string;
  attach?: NonEmptyReadonlyArray<Uint8Array>;
  timestamp?: number;
  startTimestamp?: number;
}

// The results are read with the metric kit, so the field states no type.
export interface MetricPartBodyEncoded {
  data: unknown;
}

const resultsOf = <K extends MetricKit.Any>(metrickit: K) =>
  Schema.Union(
    Metric.MetricParts(metrickit).members.map((part) =>
      part.fields.data.mapMembers((members) =>
        members.map((member) =>
          Schema.toEncoded(member.mapFields(({ attach: _attach, ...rest }) => rest)),
        ),
      ),
    ),
  );

// The part's timestamps are stored as epochs, so `TimestampInt` replaces the
// string schema `Trajectory.MetricMeta` states.
const partOf = <K extends MetricKit.Any>(metrickit: K) =>
  Trajectory.MetricPart(metrickit).mapFields((fields) => ({
    ...fields,
    timestamp: Schema.optional(TimestampInt),
    startTimestamp: Schema.optional(TimestampInt),
  }));

// The tag and attach list nest inside the metric, so a transformation carries
// the stored fields to it unchanged. `resultsOf` therefore states encoded fields.
export const MetricPart = <K extends MetricKit.Any>(
  metrickit: K,
): Schema.Codec<
  Trajectory.MetricPart<K>,
  MetricPartMetaEncoded & MetricPartBodyEncoded,
  Schema.Codec.DecodingServices<ReturnType<typeof Metric.MetricParts<K>>>,
  Schema.Codec.EncodingServices<ReturnType<typeof Metric.MetricParts<K>>>
> =>
  Schema.TaggedStruct("Metric", {
    metricTag: Schema.TemplateLiteral([Schema.String, "/", Schema.String]),
    attach: Schema.optional(Schema.NonEmptyArray(UuidFromByte)),
    timestamp: Schema.optional(Schema.toEncoded(TimestampInt)),
    startTimestamp: Schema.optional(Schema.toEncoded(TimestampInt)),
    data: resultsOf(metrickit),
  })
    .annotate({ identifier: "MetricPart" })
    .pipe(
      Schema.decodeTo(partOf(metrickit), {
        decode: SchemaGetter.transform(
          ({ _tag, metricTag, attach, data, timestamp, startTimestamp }) =>
            // SAFETY: the meta names the metric whose result the body holds;
            // stored apart, no type pairs them.
            ({
              _tag,
              metric: { _tag: metricTag, data: attach === undefined ? data : { ...data, attach } },
              timestamp,
              startTimestamp,
            }) as Schema.Codec.Encoded<ReturnType<typeof partOf<K>>>,
        ),
        encode: SchemaGetter.transform(({ _tag, metric, timestamp, startTimestamp }) => {
          const { attach, ...data } = metric.data;

          return { _tag, metricTag: metric._tag, attach, timestamp, startTimestamp, data };
        }),
      }),
    );
