import { Match, Schema, SchemaGetter } from "effect";

import { TimestampEpoch, Uuid, UuidFromByte } from "#/internal/schema.ts";
import * as Trajectory from "#/Trajectory.ts";

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

// The header and footer hold no part, so they are not meta variants here.
export const Meta = Schema.Union([SessionMeta, PromptMeta, ResponseMeta, EventMeta, MetricMeta]);

export type Meta = Schema.Schema.Type<typeof Meta>;

export type MetaEncoded = Schema.Codec.Encoded<typeof Meta>;
