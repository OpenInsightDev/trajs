import { Effect, Match, Schema, SchemaGetter } from "effect";

import * as Event from "#/Event.ts";
import type * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import type * as ExtraKit from "#/ExtraKit.ts";
import { TimestampEpoch, Uuid, UuidFromByte } from "#/internal/schema.ts";
import * as Metric from "#/Metric.ts";
import type * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import type * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";

const extraField = <K extends ExtraKit.Any, P extends Extra.Part>(extrakit: K, part: P) =>
  Extra.ExtraRecord(extrakit, part).pipe(Schema.withDecodingDefault(Effect.succeed({})));

const MainType = Schema.TaggedStruct("main", { id: Schema.Literal(Trajectory.mainSessionId) });

const SubType = Schema.TaggedStruct("sub", { id: Schema.String, fork: Uuid });

const MainTypeSchema = Schema.TaggedStruct("main", {});

const SubTypeSchema = Schema.TaggedStruct("sub", { id: Schema.String, fork: UuidFromByte });

const SessionType = Schema.Union([MainType, SubType]);

const SessionTypeSchema = Schema.Union([MainTypeSchema, SubTypeSchema]);

// The main session's id is the constant `"main"`, so a stored declaration holds
// no id for it and decoding states it again.
const SessionTypeField = Schema.decodeTo<
  typeof SessionType,
  typeof SessionTypeSchema,
  never,
  never
>(SessionType, {
  decode: SchemaGetter.transform((stored) =>
    Match.value(stored).pipe(
      Match.tag("main", () => MainType.make({ id: Trajectory.mainSessionId })),
      Match.tag("sub", (sub) => SubType.make({ id: sub.id, fork: sub.fork })),
      Match.exhaustive,
    ),
  ),
  encode: SchemaGetter.transform((session) =>
    Match.value(session).pipe(
      Match.tag("main", () => MainTypeSchema.make({})),
      Match.tag("sub", (sub) => SubTypeSchema.make({ id: sub.id, fork: sub.fork })),
      Match.exhaustive,
    ),
  ),
})(SessionTypeSchema);

export const SessionMeta = Schema.TaggedStruct("Session", {
  type: SessionTypeField,
  uuid: UuidFromByte,
});

export type SessionMeta = Schema.Schema.Type<typeof SessionMeta>;

export type SessionMetaEncoded = Schema.Codec.Encoded<typeof SessionMeta>;

export const PromptMeta = Schema.TaggedStruct("Prompt", {
  uuid: UuidFromByte,
  sessionId: Schema.optional(Schema.String),
  timestamp: Schema.optional(TimestampEpoch),
  startTimestamp: Schema.optional(TimestampEpoch),
});

export type PromptMeta = Schema.Schema.Type<typeof PromptMeta>;

export type PromptMetaEncoded = Schema.Codec.Encoded<typeof PromptMeta>;

export const ResponseMeta = Schema.TaggedStruct("Response", {
  uuid: UuidFromByte,
  sessionId: Schema.optional(Schema.String),
  timestamp: TimestampEpoch,
  startTimestamp: Schema.optional(TimestampEpoch),
});

export type ResponseMeta = Schema.Schema.Type<typeof ResponseMeta>;

export type ResponseMetaEncoded = Schema.Codec.Encoded<typeof ResponseMeta>;

export const EventMeta = Schema.TaggedStruct("Event", {
  uuid: UuidFromByte,
  sessionId: Schema.optional(Schema.String),
  timestamp: TimestampEpoch,
  startTimestamp: Schema.optional(TimestampEpoch),
});

export type EventMeta = Schema.Schema.Type<typeof EventMeta>;

export type EventMetaEncoded = Schema.Codec.Encoded<typeof EventMeta>;

export const MetricMeta = Schema.TaggedStruct("Metric", {
  metricTag: Schema.String,
  attach: Schema.optional(Schema.NonEmptyArray(UuidFromByte)),
  timestamp: Schema.optional(TimestampEpoch),
  startTimestamp: Schema.optional(TimestampEpoch),
});

export type MetricMeta = Schema.Schema.Type<typeof MetricMeta>;

export type MetricMetaEncoded = Schema.Codec.Encoded<typeof MetricMeta>;

// The header and footer frames are structural: they hold no part, so they are
// not meta variants here.
export const Meta = Schema.Union([SessionMeta, PromptMeta, ResponseMeta, EventMeta, MetricMeta]);

export type Meta = Schema.Schema.Type<typeof Meta>;

export type MetaEncoded = Schema.Codec.Encoded<typeof Meta>;

export const SessionBody = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.Struct({ extra: extraField(extrakit, "session") });

export type SessionBody<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof SessionBody<K>>
>;

export type SessionBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof SessionBody<ExtraKit.Any>>>;

export const PromptBody = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.Struct({
    messages: Schema.Array(Prompt.Message),
    extra: extraField(extrakit, "prompt"),
  });

export type PromptBody<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof PromptBody<K>>
>;

export type PromptBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof PromptBody<ExtraKit.Any>>>;

export const ResponseBody = <Toolkit extends Toolkit.Any, Extras extends ExtraKit.Any>({
  toolkit,
  extrakit,
}: {
  toolkit: Toolkit;
  extrakit: Extras;
}) =>
  Schema.Struct({
    response: Schema.Union([Response.Part(toolkit), Response.Part()]),
    extra: extraField(extrakit, "response"),
  });

export type ResponseBody<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
> = Schema.Schema.Type<ReturnType<typeof ResponseBody<Toolkit, Extras>>>;

export type ResponseBodyEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponseBody<Toolkit.Any, ExtraKit.Any>>
>;

export const EventBody = <K extends EventKit.Any>(eventkit: K) =>
  Schema.Struct({ event: Event.EventParts(eventkit) });

export type EventBody<K extends EventKit.Any> = Schema.Schema.Type<ReturnType<typeof EventBody<K>>>;

export type EventBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof EventBody<EventKit.Any>>>;

// A stored body holds the result alone: the meta names the metric whose result it
// is, and holds that result's `attach` list.
type WithoutAttach<T> = T extends unknown ? Omit<T, "attach"> : never;

type ResultOf<T> = WithoutAttach<T extends { readonly data: infer Data } ? Data : never>;

type BodyResult<K extends MetricKit.Any> = ResultOf<
  Schema.Schema.Type<ReturnType<typeof Metric.MetricParts<K>>>
>;

type BodyResultEncoded<K extends MetricKit.Any> = ResultOf<
  Schema.Codec.Encoded<ReturnType<typeof Metric.MetricParts<K>>>
>;

const resultsOf = <K extends MetricKit.Any>(
  metrickit: K,
): Schema.Codec<BodyResult<K>, BodyResultEncoded<K>> => {
  const results = Metric.MetricParts(metrickit).members.map((part) => part.fields.data);

  const stored = results.map((result) =>
    result.mapMembers((members) =>
      members.map((member) => member.mapFields(({ attach: _attach, ...rest }) => rest)),
    ),
  );

  // SAFETY: every member is a result of a metric the kit declares with `attach`
  // removed, which is what `BodyResult` reads a kit's results as.
  return Schema.Union(stored) as any;
};

export const MetricBody = <K extends MetricKit.Any>(metrickit: K) =>
  Schema.Struct({ data: resultsOf(metrickit) });

export type MetricBody<K extends MetricKit.Any> = Schema.Schema.Type<
  ReturnType<typeof MetricBody<K>>
>;

export type MetricBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricBody<MetricKit.Any>>>;

// A decoded body alone names no kit, so each composer is given the kit its body
// was read with, which is what types the part it composes.

export const sessionPart = <K extends ExtraKit.Any>(
  extrakit: K,
  meta: SessionMeta,
  body: SessionBody<K>,
): Trajectory.SessionPart<K> => ({ ...meta, ...body });

export const promptPart = <K extends ExtraKit.Any>(
  extrakit: K,
  meta: PromptMeta,
  body: PromptBody<K>,
): Trajectory.PromptPart<K> => ({ ...meta, ...body });

export const responsePart = <Toolkit extends Toolkit.Any, Extras extends ExtraKit.Any>(
  kits: { readonly toolkit: Toolkit; readonly extrakit: Extras },
  meta: ResponseMeta,
  body: ResponseBody<Toolkit, Extras>,
): Trajectory.ResponsePart<Toolkit, Extras> => ({ ...meta, ...body });

export const eventPart = <K extends EventKit.Any>(
  eventkit: K,
  meta: EventMeta,
  body: EventBody<K>,
): Trajectory.EventPart<K> => ({ ...meta, ...body });

export const metricPart = <K extends MetricKit.Any>(
  metrickit: K,
  meta: MetricMeta,
  body: MetricBody<K>,
): Trajectory.MetricPart<K> => {
  const { attach } = meta;
  const data = attach === undefined ? body.data : { ...body.data, attach };

  // SAFETY: the meta names the metric whose result the body holds, so the two
  // are one metric part; they are decoded apart, so no type pairs the tag with
  // the result.
  return {
    _tag: meta._tag,
    metric: { _tag: meta.metricTag, data },
    timestamp: meta.timestamp,
    startTimestamp: meta.startTimestamp,
  } as Trajectory.MetricPart<K>;
};

// The other direction: a part as the frame of one meta and one body, which is
// what a writer stores.

export type Frame<Meta, Body> = Readonly<{ meta: Meta; body: Body }>;

export const sessionFrame = <K extends ExtraKit.Any>(
  extrakit: K,
  part: Trajectory.SessionPart<K>,
): Frame<SessionMeta, SessionBody<K>> => ({
  meta: { _tag: part._tag, type: part.type, uuid: part.uuid },
  body: { extra: part.extra },
});

export const promptFrame = <K extends ExtraKit.Any>(
  extrakit: K,
  part: Trajectory.PromptPart<K>,
): Frame<PromptMeta, PromptBody<K>> => ({
  meta: {
    _tag: part._tag,
    uuid: part.uuid,
    sessionId: part.sessionId,
    timestamp: part.timestamp,
    startTimestamp: part.startTimestamp,
  },
  body: { messages: part.messages, extra: part.extra },
});

export const responseFrame = <Toolkit extends Toolkit.Any, Extras extends ExtraKit.Any>(
  kits: { readonly toolkit: Toolkit; readonly extrakit: Extras },
  part: Trajectory.ResponsePart<Toolkit, Extras>,
): Frame<ResponseMeta, ResponseBody<Toolkit, Extras>> => ({
  meta: {
    _tag: part._tag,
    uuid: part.uuid,
    sessionId: part.sessionId,
    timestamp: part.timestamp,
    startTimestamp: part.startTimestamp,
  },
  body: { response: part.response, extra: part.extra },
});

export const eventFrame = <K extends EventKit.Any>(
  eventkit: K,
  part: Trajectory.EventPart<K>,
): Frame<EventMeta, EventBody<K>> => ({
  meta: {
    _tag: part._tag,
    uuid: part.uuid,
    sessionId: part.sessionId,
    timestamp: part.timestamp,
    startTimestamp: part.startTimestamp,
  },
  body: { event: part.event },
});

export const metricFrame = <K extends MetricKit.Any>(
  metrickit: K,
  part: Trajectory.MetricPart<K>,
): Frame<MetricMeta, MetricBody<K>> => {
  const { attach, ...data } = part.metric.data;

  return {
    meta: {
      _tag: part._tag,
      metricTag: part.metric._tag,
      attach,
      timestamp: part.timestamp,
      startTimestamp: part.startTimestamp,
    },
    // SAFETY: the data is the part's own result less the `attach` list the meta
    // states above, which is what `BodyResult` names for that result.
    body: { data: data as BodyResult<K> },
  };
};
