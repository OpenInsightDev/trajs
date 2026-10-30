import { StreamHash } from "@trajs/utils";
import { Effect, Match, Schema, SchemaGetter } from "effect";
import type { DateTime } from "effect";
import type { NonEmptyReadonlyArray } from "effect/Array";

import type * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { ChunkTableEntry, type ChunkTableEntryEncoded } from "#/internal/exchange/chunk.ts";
import { TimestampInt, UuidFromByte } from "#/internal/schema.ts";
import * as Metric from "#/Metric.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";

// A frame holds a meta and a body.
// The meta is the tag and the identifiers a reader reads with no config.
// A uuid is stored as 16 bytes and a moment as its epoch, so a meta region stays small.
// The body is what a kit decodes.
// A kind states its fields once, as the two halves a chunk holds, and the part they compose.

export interface HeaderPartMetaEncoded {
  _tag: "Header";
}

// The tag alone, so the header is told from a part before either region is read.
export const HeaderPartMeta: Schema.Codec<HeaderPartMetaEncoded> = Schema.Struct({
  _tag: Schema.tag("Header"),
}).annotate({ identifier: "HeaderPartMeta" });

export interface HeaderPartBodyEncoded {
  version: string;
  hash: StreamHash.Algorithm;
  toolkit: Toolkit.ToolkitSchema;
  eventkit: EventKit.EventKitSchema;
  metrickit: MetricKit.MetricKitSchema;
  extrakit: ExtraKit.ExtraKitSchema;
}

// The header is alone in the first chunk, so a reader holds the kits before it decodes a body.
export const HeaderPartBody: Schema.Codec<HeaderPartBodyEncoded> = Schema.Struct({
  version: Schema.String,
  hash: StreamHash.Algorithm,
  toolkit: Toolkit.ToolkitSchema,
  eventkit: EventKit.EventKitSchema,
  metrickit: MetricKit.MetricKitSchema,
  extrakit: ExtraKit.ExtraKitSchema,
}).annotate({ identifier: "HeaderPartBody" });

export const headerPartBodyOf = (
  config: Config.AnyConfig,
  { version, hash }: { readonly version: string; readonly hash: StreamHash.Algorithm },
): HeaderPartBodyEncoded => ({
  version,
  hash,
  toolkit: Toolkit.encode(config.toolkit),
  eventkit: EventKit.encode(config.eventkit),
  metrickit: MetricKit.encode(config.metrickit),
  extrakit: ExtraKit.encode(config.extrakit),
});

export interface FooterPartMetaEncoded {
  _tag: "Footer";
}

// The tag alone: a walk of a stream stops at the chunk whose meta states it.
export const FooterPartMeta: Schema.Codec<FooterPartMetaEncoded> = Schema.Struct({
  _tag: Schema.tag("Footer"),
}).annotate({ identifier: "FooterPartMeta" });

export interface FooterPartBodyEncoded {
  chunks: ReadonlyArray<ChunkTableEntryEncoded>;
}

// The footer is alone in the last chunk of a file, so its table locates every data chunk.
export const FooterPartBody: Schema.Codec<FooterPartBodyEncoded> = Schema.Struct({
  chunks: Schema.Array(ChunkTableEntry),
}).annotate({ identifier: "FooterPartBody" });

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

const promptMetaFields = {
  _tag: Schema.tag("Prompt"),
  uuid: UuidFromByte,
  sessionId: Schema.optional(Schema.String),
  timestamp: Schema.optional(TimestampInt),
  startTimestamp: Schema.optional(TimestampInt),
};

export const PromptPartMeta: Schema.Codec<Trajectory.PromptMeta, PromptPartMetaEncoded> =
  Schema.Struct(promptMetaFields).annotate({ identifier: "PromptPartMeta" });

const promptBodyFields = <K extends ExtraKit.Any>(extrakit: K) => ({
  messages: Prompt.Message.pipe(Schema.Array, Schema.mutable),
  extra: extraField(extrakit, "prompt"),
});

export const PromptPartBody = <K extends ExtraKit.Any>(
  extrakit: K,
): Schema.Codec<Trajectory.PromptBody<K>, PromptPartBodyEncoded> =>
  Schema.Struct(promptBodyFields(extrakit)).annotate({ identifier: "PromptPartBody" });

export const PromptPart = <K extends ExtraKit.Any>(
  extrakit: K,
): Schema.Codec<Trajectory.PromptPart<K>, PromptPartMetaEncoded & PromptPartBodyEncoded> =>
  Schema.Struct({ ...promptMetaFields, ...promptBodyFields(extrakit) }).annotate({
    identifier: "PromptPart",
  });

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

// The declaration alone: a reader draws a session tree from what this states.
const sessionMetaFields = {
  _tag: Schema.tag("Session"),
  uuid: UuidFromByte,
  type: SessionType,
};

export const SessionPartMeta: Schema.Codec<Trajectory.SessionMeta, SessionPartMetaEncoded> =
  Schema.Struct(sessionMetaFields).annotate({ identifier: "SessionPartMeta" });

const sessionBodyFields = <K extends ExtraKit.Any>(extrakit: K) => ({
  extra: extraField(extrakit, "session"),
});

export const SessionPartBody = <K extends ExtraKit.Any>(
  extrakit: K,
): Schema.Codec<Trajectory.SessionBody<K>, SessionPartBodyEncoded> =>
  Schema.Struct(sessionBodyFields(extrakit)).annotate({ identifier: "SessionPartBody" });

export const SessionPart = <K extends ExtraKit.Any>(
  extrakit: K,
): Schema.Codec<Trajectory.SessionPart<K>, SessionPartMetaEncoded & SessionPartBodyEncoded> =>
  Schema.Struct({ ...sessionMetaFields, ...sessionBodyFields(extrakit) }).annotate({
    identifier: "SessionPart",
  });

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

const responseMetaFields = {
  _tag: Schema.tag("Response"),
  uuid: UuidFromByte,
  sessionId: Schema.optional(Schema.String),
  timestamp: TimestampInt,
  startTimestamp: Schema.optional(TimestampInt),
};

export const ResponsePartMeta: Schema.Codec<Trajectory.ResponseMeta, ResponsePartMetaEncoded> =
  Schema.Struct(responseMetaFields).annotate({ identifier: "ResponsePartMeta" });

const responseBodyFields = <T extends Toolkit.Any, K extends ExtraKit.Any>(
  toolkit: T,
  extrakit: K,
) => ({
  response: responsePartsOf(toolkit),
  extra: extraField(extrakit, "response"),
});

export const ResponsePartBody = <T extends Toolkit.Any, K extends ExtraKit.Any>(
  toolkit: T,
  extrakit: K,
): Schema.Codec<
  Trajectory.ResponseBody<T, K>,
  ResponsePartBodyEncoded,
  Schema.Codec.DecodingServices<ResponsePartsOf<T>>,
  Schema.Codec.EncodingServices<ResponsePartsOf<T>>
> =>
  Schema.Struct(responseBodyFields(toolkit, extrakit)).annotate({
    identifier: "ResponsePartBody",
  });

export const ResponsePart = <T extends Toolkit.Any, K extends ExtraKit.Any>(
  toolkit: T,
  extrakit: K,
): Schema.Codec<
  Trajectory.ResponsePart<T, K>,
  ResponsePartMetaEncoded & ResponsePartBodyEncoded,
  Schema.Codec.DecodingServices<ResponsePartsOf<T>>,
  Schema.Codec.EncodingServices<ResponsePartsOf<T>>
> =>
  Schema.Struct({ ...responseMetaFields, ...responseBodyFields(toolkit, extrakit) }).annotate({
    identifier: "ResponsePart",
  });

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

const eventMetaFields = {
  _tag: Schema.tag("Event"),
  uuid: UuidFromByte,
  sessionId: Schema.optional(Schema.String),
  timestamp: TimestampInt,
  startTimestamp: Schema.optional(TimestampInt),
};

export const EventPartMeta: Schema.Codec<Trajectory.EventMeta, EventPartMetaEncoded> =
  Schema.Struct(eventMetaFields).annotate({ identifier: "EventPartMeta" });

const eventBodyFields = <K extends EventKit.Any>(eventkit: K) => ({
  event: Event.EventParts(eventkit),
});

export const EventPartBody = <K extends EventKit.Any>(
  eventkit: K,
): Schema.Codec<
  Trajectory.EventBody<K>,
  EventPartBodyEncoded,
  Schema.Codec.DecodingServices<ReturnType<typeof Event.EventParts<K>>>,
  Schema.Codec.EncodingServices<ReturnType<typeof Event.EventParts<K>>>
> => Schema.Struct(eventBodyFields(eventkit)).annotate({ identifier: "EventPartBody" });

export const EventPart = <K extends EventKit.Any>(
  eventkit: K,
): Schema.Codec<
  Trajectory.EventPart<K>,
  EventPartMetaEncoded & EventPartBodyEncoded,
  Schema.Codec.DecodingServices<ReturnType<typeof Event.EventParts<K>>>,
  Schema.Codec.EncodingServices<ReturnType<typeof Event.EventParts<K>>>
> =>
  Schema.Struct({ ...eventMetaFields, ...eventBodyFields(eventkit) }).annotate({
    identifier: "EventPart",
  });

export interface MetricPartMetaEncoded {
  _tag: "Metric";
  metricTag: string;
  attach?: NonEmptyReadonlyArray<Uint8Array>;
  timestamp?: number;
  startTimestamp?: number;
}

// The meta of a metric part, which is the one meta that is not a subset of its
// part: the tag and the attach list are lifted out of the part's metric, so a
// reader learns what a result attaches to without reading the body, and the part
// keeps both where it holds them.
export interface MetricPartMeta {
  readonly _tag: "Metric";
  readonly metricTag: string;
  readonly attach?: NonEmptyReadonlyArray<string>;
  readonly timestamp?: DateTime.Utc;
  readonly startTimestamp?: DateTime.Utc;
}

const metricMetaFields = {
  _tag: Schema.tag("Metric"),
  metricTag: Schema.TemplateLiteral([Schema.String, "/", Schema.String]),
  attach: Schema.optional(Schema.NonEmptyArray(UuidFromByte)),
  timestamp: Schema.optional(TimestampInt),
  startTimestamp: Schema.optional(TimestampInt),
};

export const MetricPartMeta: Schema.Codec<MetricPartMeta, MetricPartMetaEncoded> = Schema.Struct(
  metricMetaFields,
).annotate({ identifier: "MetricPartMeta" });

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

const metricBodyFields = <K extends MetricKit.Any>(metrickit: K) => ({
  data: resultsOf(metrickit),
});

export const MetricPartBody = <K extends MetricKit.Any>(
  metrickit: K,
): Schema.Codec<
  MetricPartBodyEncoded,
  MetricPartBodyEncoded,
  Schema.Codec.DecodingServices<ReturnType<typeof Metric.MetricParts<K>>>,
  Schema.Codec.EncodingServices<ReturnType<typeof Metric.MetricParts<K>>>
> => Schema.Struct(metricBodyFields(metrickit)).annotate({ identifier: "MetricPartBody" });

// The part's timestamps are moments by the time the transformation reads them, so
// the epochs are the meta's business alone and this only states where the metric
// nests.
const partOf = <K extends MetricKit.Any>(metrickit: K) =>
  Trajectory.MetricPart(metrickit).mapFields((fields) => ({
    ...fields,
    timestamp: Schema.optional(Schema.toType(TimestampInt)),
    startTimestamp: Schema.optional(Schema.toType(TimestampInt)),
  }));

// The two halves are one struct in the stored form, so the split is a view of it.
// The transformation states what the view cannot: the meta's tag and attach list
// go into the part's metric, and the body's result comes back out without them.
const metricPartStored = <K extends MetricKit.Any>(metrickit: K) =>
  Schema.Struct({ ...metricMetaFields, ...metricBodyFields(metrickit) });

export const MetricPart = <K extends MetricKit.Any>(
  metrickit: K,
): Schema.Codec<
  Trajectory.MetricPart<K>,
  MetricPartMetaEncoded & MetricPartBodyEncoded,
  Schema.Codec.DecodingServices<ReturnType<typeof Metric.MetricParts<K>>>,
  Schema.Codec.EncodingServices<ReturnType<typeof Metric.MetricParts<K>>>
> =>
  metricPartStored(metrickit)
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

// Every meta a frame may hold, read with no config: the five kinds a data chunk
// holds, and the two structural frames a walk stops at.
export const Meta = Schema.Union([
  PromptPartMeta,
  SessionPartMeta,
  ResponsePartMeta,
  EventPartMeta,
  MetricPartMeta,
  HeaderPartMeta,
  FooterPartMeta,
]).annotate({ identifier: "Meta" });

export type Meta = Schema.Schema.Type<typeof Meta>;
