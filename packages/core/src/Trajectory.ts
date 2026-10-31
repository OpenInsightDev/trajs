/**
 * A named stream of parts, read with one config.
 *
 * {@link make} binds an id and a config to a stream of {@link Part}.
 * {@link parts} builds those parts.
 * The part schemas read a trajectory back from storage.
 *
 * @stability stable
 */

import { DateTime, Effect, Option, Result, Schema, Stream } from "effect";

import * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { TimestampString, Uuid } from "#/internal/schema.ts";
import { attach, uuid } from "#/internal/trajectory.ts";
import * as Metric from "#/Metric.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Toolkit from "#/Toolkit.ts";

const extraField = <K extends ExtraKit.Any, P extends Extra.Part>(extrakit: K, part: P) =>
  Extra.ExtraRecord(extrakit, part).pipe(Schema.withDecodingDefault(Effect.succeed({})));

/**
 * Schema for the metadata of a prompt part.
 *
 * **Details**
 *
 * `uuid` is a uuid v7. Construction fills one when the caller omits it.
 * A missing `sessionId` means {@link mainSessionId}.
 * `timestamp` is the moment the part was produced.
 * A missing `startTimestamp` leaves that moment alone.
 *
 * **Gotchas**
 *
 * `timestamp` stays absent when omitted.
 * {@link ResponseMeta} requires it.
 *
 * @see {@link PromptBody} for the content beside it.
 * @stability stable
 * @category schemas
 */
export const PromptMeta = Schema.TaggedStruct("Prompt", {
  sessionId: Schema.optional(Schema.String),
  uuid: Uuid,
  timestamp: Schema.optional(TimestampString),
  startTimestamp: Schema.optional(TimestampString),
});

/**
 * The metadata of a prompt part.
 *
 * @see {@link PromptMeta} for the schema.
 * @stability stable
 * @category models
 */
export type PromptMeta = Schema.Schema.Type<typeof PromptMeta>;

/**
 * The wire form of a {@link PromptMeta}.
 *
 * @stability stable
 * @category encoding
 */
export type PromptMetaEncoded = Schema.Codec.Encoded<typeof PromptMeta>;

/**
 * Schema for the content of a prompt part, read with `extrakit`.
 *
 * **Details**
 *
 * `messages` holds the content of a {@link Prompt.Prompt}.
 * `extra` decodes as `{}` when the payload omits it.
 *
 * @see {@link PromptMeta} for the metadata beside it.
 * @stability stable
 * @category schemas
 */
export const PromptBody = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.Struct({
    messages: Schema.Array(Prompt.Message),
    extra: extraField(extrakit, "prompt"),
  });

/**
 * The content of a prompt part, read with `extrakit`.
 *
 * @see {@link PromptBody} for the schema.
 * @stability stable
 * @category models
 */
export type PromptBody<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof PromptBody<K>>
>;

/**
 * The wire form of a {@link PromptBody}.
 *
 * **Details**
 *
 * The alias is not generic.
 * Each extra value stays unknown under {@link ExtraKit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type PromptBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof PromptBody<ExtraKit.Any>>>;

/**
 * Schema for a prompt part of `extrakit`.
 *
 * **When to use**
 *
 * Use when a stored prompt must be decoded with the extras of one kit.
 *
 * **Details**
 *
 * A prompt part holds the fields of {@link PromptMeta} and {@link PromptBody}.
 *
 * @see {@link parts} for building a prompt part from a {@link Prompt.Prompt}.
 * @see {@link PromptPartOf} for the prompt part of a config.
 * @see {@link PromptBody} for the content alone.
 * @stability stable
 * @category schemas
 */
export const PromptPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.Struct({ ...PromptMeta.fields, ...PromptBody(extrakit).fields });

/**
 * A prompt part decoded with `extrakit`.
 *
 * @see {@link PromptPart} for the schema.
 * @stability stable
 * @category models
 */
export type PromptPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof PromptPart<K>>
>;

/**
 * The wire form of a {@link PromptPart}.
 *
 * **Details**
 *
 * The alias is not generic.
 * Each extra value stays unknown under {@link ExtraKit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type PromptPartEncoded = Schema.Codec.Encoded<ReturnType<typeof PromptPart<ExtraKit.Any>>>;

/**
 * The id of the main session, `"main"`.
 *
 * **Details**
 *
 * A part with no `sessionId` belongs to the main session.
 * Stating this id means the same session.
 * The main session needs no declaration of its own.
 *
 * @see {@link SessionPart} for the `main` and `sub` declarations.
 * @stability stable
 * @category constants
 */
export const mainSessionId = "main";

const MainSession = Schema.TaggedStruct("main", { id: Schema.Literal(mainSessionId) });

export const mainSession = MainSession.make({ id: mainSessionId });

const SubSession = Schema.TaggedStruct("sub", { id: Schema.String, fork: Uuid });

export const subSession = (id: string, { fork }: { fork: string }) => SubSession.make({ id, fork });

/**
 * Schema for the metadata of a session declaration.
 *
 * **Details**
 *
 * `type` is `main` or `sub`.
 * `main` carries {@link mainSessionId}.
 * `sub` carries its own `id` and a `fork` uuid.
 * `uuid` is a uuid v7. Construction fills one when the caller omits it.
 *
 * **Gotchas**
 *
 * A session declaration has no `timestamp` and no `sessionId`.
 *
 * @see {@link SessionBody} for the extras beside it.
 * @stability stable
 * @category schemas
 */
export const SessionMeta = Schema.TaggedStruct("Session", {
  type: Schema.Union([MainSession, SubSession]),
  uuid: Uuid,
});

/**
 * The metadata of a session declaration.
 *
 * @see {@link SessionMeta} for the schema.
 * @stability stable
 * @category models
 */
export type SessionMeta = Schema.Schema.Type<typeof SessionMeta>;

/**
 * The wire form of a {@link SessionMeta}.
 *
 * @stability stable
 * @category encoding
 */
export type SessionMetaEncoded = Schema.Codec.Encoded<typeof SessionMeta>;

/**
 * Schema for the extras of a session declaration, read with `extrakit`.
 *
 * **Details**
 *
 * `extra` decodes as `{}` when the payload omits it.
 *
 * @see {@link SessionMeta} for the metadata beside it.
 * @stability stable
 * @category schemas
 */
export const SessionBody = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.Struct({ extra: extraField(extrakit, "session") });

/**
 * The extras of a session declaration, read with `extrakit`.
 *
 * @see {@link SessionBody} for the schema.
 * @stability stable
 * @category models
 */
export type SessionBody<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof SessionBody<K>>
>;

/**
 * The wire form of a {@link SessionBody}.
 *
 * **Details**
 *
 * The alias is not generic.
 * Each extra value stays unknown under {@link ExtraKit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type SessionBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof SessionBody<ExtraKit.Any>>>;

/**
 * Schema for a session declaration of `extrakit`.
 *
 * **When to use**
 *
 * Use when a stored session declaration must be decoded with the extras of one kit.
 *
 * **Details**
 *
 * A session declaration holds the fields of {@link SessionMeta} and {@link SessionBody}.
 *
 * @see {@link parts} for `mainSession` and `subSession`.
 * @see {@link SessionPartOf} for the session part of a config.
 * @see {@link SessionBody} for the extras alone.
 * @stability stable
 * @category schemas
 */
export const SessionPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.Struct({ ...SessionMeta.fields, ...SessionBody(extrakit).fields });

/**
 * A session declaration decoded with `extrakit`.
 *
 * @see {@link SessionPart} for the schema.
 * @stability stable
 * @category models
 */
export type SessionPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof SessionPart<K>>
>;

/**
 * The wire form of a {@link SessionPart}.
 *
 * **Details**
 *
 * The alias is not generic.
 * Each extra value stays unknown under {@link ExtraKit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type SessionPartEncoded = Schema.Codec.Encoded<ReturnType<typeof SessionPart<ExtraKit.Any>>>;

/**
 * Schema for the metadata of a response part.
 *
 * **Details**
 *
 * `timestamp` is required. Construction uses the current time when the caller omits it.
 * `uuid` is a uuid v7. Construction fills one when the caller omits it.
 * A missing `sessionId` means {@link mainSessionId}.
 * A missing `startTimestamp` leaves the moment of `timestamp` alone.
 *
 * @see {@link ResponseBody} for the response beside it.
 * @stability stable
 * @category schemas
 */
export const ResponseMeta = Schema.TaggedStruct("Response", {
  timestamp: TimestampString,
  startTimestamp: Schema.optional(TimestampString),
  sessionId: Schema.optional(Schema.String),
  uuid: Uuid,
});

/**
 * The metadata of a response part.
 *
 * @see {@link ResponseMeta} for the schema.
 * @stability stable
 * @category models
 */
export type ResponseMeta = Schema.Schema.Type<typeof ResponseMeta>;

/**
 * The wire form of a {@link ResponseMeta}.
 *
 * @stability stable
 * @category encoding
 */
export type ResponseMetaEncoded = Schema.Codec.Encoded<typeof ResponseMeta>;

/**
 * Schema for the response a response part carries, read with `toolkit` and `extrakit`.
 *
 * **Details**
 *
 * `response` is one finished response part, a {@link Response.Part}.
 * The schema also accepts parts built for tools beyond `toolkit`.
 * `extra` decodes as `{}` when the payload omits it.
 *
 * @see {@link ResponseMeta} for the metadata beside it.
 * @stability stable
 * @category schemas
 */
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

/**
 * The response a response part carries, read with `toolkit` and `extrakit`.
 *
 * @see {@link ResponseBody} for the schema.
 * @stability stable
 * @category models
 */
export type ResponseBody<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
> = Schema.Schema.Type<ReturnType<typeof ResponseBody<Toolkit, Extras>>>;

/**
 * The wire form of a {@link ResponseBody}.
 *
 * **Details**
 *
 * The alias is not generic.
 * Each response payload stays unknown under {@link Toolkit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type ResponseBodyEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponseBody<Toolkit.Any, ExtraKit.Any>>
>;

/**
 * Schema for a response part of `toolkit` and `extrakit`.
 *
 * **When to use**
 *
 * Use when a response part must be read with the tools and extras of one config.
 *
 * **Details**
 *
 * A response part holds the fields of {@link ResponseMeta} and {@link ResponseBody}.
 *
 * **Gotchas**
 *
 * A streamed answer is many parts while it is written.
 * A trajectory holds the part the answer ended in, not those increments.
 *
 * @see {@link parts} for building a response part.
 * @see {@link ResponsePartOf} for the response part of a config.
 * @see {@link ResponseBody} for the response alone.
 * @stability stable
 * @category schemas
 */
export const ResponsePart = <Toolkit extends Toolkit.Any, Extras extends ExtraKit.Any>({
  toolkit,
  extrakit,
}: {
  toolkit: Toolkit;
  extrakit: Extras;
}) =>
  Schema.Struct({
    ...ResponseMeta.fields,
    ...ResponseBody({ toolkit, extrakit }).fields,
  });

/**
 * A response part decoded for `Toolkit` and `Extras`.
 *
 * @see {@link ResponsePart} for the schema.
 * @stability stable
 * @category models
 */
export type ResponsePart<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
> = Schema.Schema.Type<ReturnType<typeof ResponsePart<Toolkit, Extras>>>;

/**
 * The wire form of a {@link ResponsePart}.
 *
 * **Details**
 *
 * The alias is not generic.
 * Each response payload stays unknown under {@link Toolkit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type ResponsePartEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponsePart<Toolkit.Any, ExtraKit.Any>>
>;

/**
 * Schema for the metadata of an event part.
 *
 * **Details**
 *
 * `timestamp` is required. Construction uses the current time when the caller omits it.
 * A missing `startTimestamp` leaves that moment alone.
 * A missing `sessionId` means {@link mainSessionId}.
 * `uuid` is a uuid v7. Construction fills one when the caller omits it.
 *
 * @see {@link EventBody} for the event beside it.
 * @stability stable
 * @category schemas
 */
export const EventMeta = Schema.TaggedStruct("Event", {
  timestamp: TimestampString,
  startTimestamp: Schema.optional(TimestampString),
  sessionId: Schema.optional(Schema.String),
  uuid: Uuid,
});

/**
 * The metadata of an event part.
 *
 * @see {@link EventMeta} for the schema.
 * @stability stable
 * @category models
 */
export type EventMeta = Schema.Schema.Type<typeof EventMeta>;

/**
 * The wire form of a {@link EventMeta}.
 *
 * @stability stable
 * @category encoding
 */
export type EventMetaEncoded = Schema.Codec.Encoded<typeof EventMeta>;

/**
 * Schema for the event an event part carries, read with `eventkit`.
 *
 * **Details**
 *
 * `event` is one event the kit declares.
 *
 * **Gotchas**
 *
 * An event part carries no extras.
 *
 * @see {@link EventMeta} for the metadata beside it.
 * @stability stable
 * @category schemas
 */
export const EventBody = <K extends EventKit.Any>(eventkit: K) =>
  Schema.Struct({ event: Event.EventParts(eventkit) });

/**
 * The event an event part carries, read with `eventkit`.
 *
 * @see {@link EventBody} for the schema.
 * @stability stable
 * @category models
 */
export type EventBody<K extends EventKit.Any> = Schema.Schema.Type<ReturnType<typeof EventBody<K>>>;

/**
 * The wire form of a {@link EventBody}.
 *
 * **Details**
 *
 * The alias is not generic.
 * The event payload stays unknown under {@link EventKit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type EventBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof EventBody<EventKit.Any>>>;

/**
 * Schema for an event part of `eventkit`.
 *
 * **When to use**
 *
 * Use when a stored event must be decoded with the events of one kit.
 *
 * **Details**
 *
 * An event part holds the fields of {@link EventMeta} and {@link EventBody}.
 *
 * @see {@link parts} for building an event part.
 * @see {@link EventPartOf} for the event part of a config.
 * @see {@link EventBody} for the event alone.
 * @stability stable
 * @category schemas
 */
export const EventPart = <K extends EventKit.Any>(eventkit: K) =>
  Schema.Struct({ ...EventMeta.fields, ...EventBody(eventkit).fields });

/**
 * An event part decoded with `eventkit`.
 *
 * @see {@link EventPart} for the schema.
 * @stability stable
 * @category models
 */
export type EventPart<K extends EventKit.Any> = Schema.Schema.Type<ReturnType<typeof EventPart<K>>>;

/**
 * The wire form of an {@link EventPart}.
 *
 * **Details**
 *
 * The alias is not generic.
 * The event payload stays unknown under {@link EventKit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type EventPartEncoded = Schema.Codec.Encoded<ReturnType<typeof EventPart<EventKit.Any>>>;

/**
 * Schema for the metadata of a metric part.
 *
 * **Details**
 *
 * `timestamp` and `startTimestamp` stay absent when omitted.
 *
 * **Gotchas**
 *
 * A metric part has no `uuid` and no `sessionId`.
 * The metric's tag and its attachments stay in {@link MetricBody}.
 *
 * @see {@link MetricBody} for the metric beside it.
 * @stability stable
 * @category schemas
 */
export const MetricMeta = Schema.TaggedStruct("Metric", {
  timestamp: Schema.optional(TimestampString),
  startTimestamp: Schema.optional(TimestampString),
});

/**
 * The metadata of a metric part.
 *
 * @see {@link MetricMeta} for the schema.
 * @stability stable
 * @category models
 */
export type MetricMeta = Schema.Schema.Type<typeof MetricMeta>;

/**
 * The wire form of a {@link MetricMeta}.
 *
 * @stability stable
 * @category encoding
 */
export type MetricMetaEncoded = Schema.Codec.Encoded<typeof MetricMeta>;

/**
 * Schema for the metric a metric part carries, read with `metrickit`.
 *
 * **Details**
 *
 * `metric` is one metric the kit declares.
 *
 * @see {@link MetricMeta} for the metadata beside it.
 * @stability stable
 * @category schemas
 */
export const MetricBody = <K extends MetricKit.Any>(metrickit: K) =>
  Schema.Struct({ metric: Metric.MetricParts(metrickit) });

/**
 * The metric a metric part carries, read with `metrickit`.
 *
 * @see {@link MetricBody} for the schema.
 * @stability stable
 * @category models
 */
export type MetricBody<K extends MetricKit.Any> = Schema.Schema.Type<
  ReturnType<typeof MetricBody<K>>
>;

/**
 * The wire form of a {@link MetricBody}.
 *
 * **Details**
 *
 * The alias is not generic.
 * The metric payload stays unknown under {@link MetricKit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type MetricBodyEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricBody<MetricKit.Any>>>;

/**
 * Schema for a metric part of `metrickit`.
 *
 * **When to use**
 *
 * Use when a stored metric must be decoded with the metrics of one kit.
 *
 * **Details**
 *
 * A metric part holds the fields of {@link MetricMeta} and {@link MetricBody}.
 *
 * @see {@link parts} for building a metric part.
 * @see {@link MetricPartOf} for the metric part of a config.
 * @see {@link MetricBody} for the metric alone.
 * @stability stable
 * @category schemas
 */
export const MetricPart = <K extends MetricKit.Any>(metrickit: K) =>
  Schema.Struct({ ...MetricMeta.fields, ...MetricBody(metrickit).fields });

/**
 * A metric part decoded with `metrickit`.
 *
 * @see {@link MetricPart} for the schema.
 * @stability stable
 * @category models
 */
export type MetricPart<K extends MetricKit.Any> = Schema.Schema.Type<
  ReturnType<typeof MetricPart<K>>
>;

/**
 * The wire form of a {@link MetricPart}.
 *
 * **Details**
 *
 * The alias is not generic.
 * The metric payload stays unknown under {@link MetricKit.Any}.
 *
 * @stability stable
 * @category encoding
 */
export type MetricPartEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricPart<MetricKit.Any>>>;

/**
 * Schema for the metadata of one part, whichever kind it is.
 *
 * **When to use**
 *
 * Use when only the metadata of a stored part is needed.
 *
 * **Details**
 *
 * Each member is the meta schema of one part kind.
 * The body of that kind holds the payload beside those fields.
 * Decoding an encoded part keeps these fields and drops its body.
 *
 * @see {@link Part} for the parts that hold a body too.
 * @stability stable
 * @category schemas
 */
export const Meta = Schema.Union([PromptMeta, SessionMeta, ResponseMeta, EventMeta, MetricMeta]);

/**
 * The metadata of one part, whichever kind it is.
 *
 * @see {@link Meta} for the schema.
 * @stability stable
 * @category models
 */
export type Meta = Schema.Schema.Type<typeof Meta>;

/**
 * The wire form of {@link Meta}.
 *
 * @stability stable
 * @category encoding
 */
export type MetaEncoded = Schema.Codec.Encoded<typeof Meta>;

/**
 * Builders for every part kind of one config.
 *
 * **When to use**
 *
 * Use when each part should match the kits and the variant of that config.
 *
 * **Details**
 *
 * A builder takes the part body, then options.
 * State a known `uuid`, `timestamp`, `startTimestamp`, or `sessionId` there.
 * Pass extra fields beside those options, not under an `extra` key.
 * `subSession` requires `fork`, the uuid of an earlier part.
 *
 * **Gotchas**
 *
 * An omitted `uuid` becomes a new uuid v7.
 * An omitted required `timestamp` becomes the current time.
 * Pass a known `uuid` when a later session must fork from that part.
 *
 * @see {@link parts} for the builders of one config.
 * @stability stable
 * @category models
 */
export interface Parts<Config extends Config.AnyConfig> {
  readonly prompt: (
    prompt: Prompt.Prompt,
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly startTimestamp?: DateTime.Utc;
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config.ExtrasOf<Config>, "prompt">,
  ) => PromptPart<Config["extrakit"]>;

  readonly mainSession: (
    options?: {
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config.ExtrasOf<Config>, "session">,
  ) => SessionPart<Config["extrakit"]>;

  readonly subSession: (
    id: string,
    options: {
      readonly fork: string;
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config.ExtrasOf<Config>, "session">,
  ) => SessionPart<Config["extrakit"]>;

  readonly response: (
    response: ResponsePart<Config["toolkit"], Config["extrakit"]>["response"],
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly startTimestamp?: DateTime.Utc;
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config.ExtrasOf<Config>, "response">,
  ) => ResponsePart<Config["toolkit"], Config["extrakit"]>;

  readonly event: (
    event: Event.EventParts<Config.EventsOf<Config>>,
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly startTimestamp?: DateTime.Utc;
      readonly uuid?: string;
    },
  ) => EventPart<Config["eventkit"]>;

  readonly metric: (
    metric: Metric.MetricParts<Config.MetricsOf<Config>>,
    options?: { readonly timestamp?: DateTime.Utc; readonly startTimestamp?: DateTime.Utc },
  ) => MetricPart<Config["metrickit"]>;
}

/**
 * Returns the {@link Parts} builders of `config`.
 *
 * **When to use**
 *
 * Use when parts should take their kits from one config.
 *
 * @see {@link make} for a trajectory of those parts.
 * @stability stable
 * @category constructors
 */
export const parts = <Config extends Config.AnyConfig>(config: Config): Parts<Config> => {
  const Prompt = PromptPart(config.extrakit);
  const Session = SessionPart(config.extrakit);

  const Response = ResponsePart({
    toolkit: config.toolkit,
    extrakit: config.extrakit,
  });

  const Event = EventPart(config.eventkit);
  const Metric = MetricPart(config.metrickit);

  return {
    prompt: (prompt, { sessionId, timestamp, startTimestamp, uuid, ...extra } = {}) =>
      Prompt.make({
        messages: prompt.content,
        sessionId,
        extra,
        timestamp,
        startTimestamp,
        uuid,
      }),
    mainSession: ({ uuid, ...extra } = {}) =>
      Session.make({ type: MainSession.make({ id: mainSessionId }), extra, uuid }),
    subSession: (id, { fork, uuid, ...extra }) =>
      Session.make({ type: SubSession.make({ id, fork }), extra, uuid }),
    // SAFETY: the schema uses the same configuration as the return type.
    response: (response, { sessionId, timestamp, startTimestamp, uuid, ...extra } = {}) =>
      Response.make({
        response,
        sessionId,
        extra,
        timestamp,
        startTimestamp,
        uuid,
      }) as ResponsePart<Config["toolkit"], Config["extrakit"]>,
    event: (event, { sessionId, timestamp, startTimestamp, uuid } = {}) =>
      Event.make({ event, sessionId, timestamp, startTimestamp, uuid }),
    metric: (metric, { timestamp, startTimestamp } = {}) =>
      Metric.make({ metric, timestamp, startTimestamp }),
  };
};

/**
 * One part of a trajectory read with `Config`.
 *
 * @see {@link PromptPartOf} for a prompt.
 * @see {@link SessionPartOf} for a session declaration.
 * @see {@link ResponsePartOf} for a response.
 * @see {@link EventPartOf} for an event.
 * @see {@link MetricPartOf} for a metric.
 * @stability stable
 * @category models
 */
export type Part<Config extends Config.AnyConfig> =
  | PromptPart<Config["extrakit"]>
  | SessionPart<Config["extrakit"]>
  | ResponsePart<Config["toolkit"], Config["extrakit"]>
  | EventPart<Config["eventkit"]>
  | MetricPart<Config["metrickit"]>;

/**
 * The prompt part of a trajectory read with `Config`.
 *
 * @see {@link PromptPart} for the part read with its extras alone.
 * @stability stable
 * @category models
 */
export type PromptPartOf<Config extends Config.AnyConfig> = PromptPart<Config["extrakit"]>;

/**
 * The session part of a trajectory read with `Config`.
 *
 * @see {@link SessionPart} for the part read with its extras alone.
 * @stability stable
 * @category models
 */
export type SessionPartOf<Config extends Config.AnyConfig> = SessionPart<Config["extrakit"]>;

/**
 * The response part of a trajectory read with `Config`.
 *
 * @see {@link ResponsePart} for the part read with its kits alone.
 * @stability stable
 * @category models
 */
export type ResponsePartOf<Config extends Config.AnyConfig> = ResponsePart<
  Config["toolkit"],
  Config["extrakit"]
>;

/**
 * The event part of a trajectory read with `Config`.
 *
 * @see {@link EventPart} for the part read with its event kit alone.
 * @stability stable
 * @category models
 */
export type EventPartOf<Config extends Config.AnyConfig> = EventPart<Config["eventkit"]>;

/**
 * The metric part of a trajectory read with `Config`.
 *
 * @see {@link MetricPart} for the part read with its metric kit alone.
 * @stability stable
 * @category models
 */
export type MetricPartOf<Config extends Config.AnyConfig> = MetricPart<Config["metrickit"]>;

/**
 * A stream of {@link Part} for `Config`, before an id is bound.
 *
 * @see {@link Trajectory} for the named stream.
 * @stability stable
 * @category models
 */
export type TrajectoryStream<Config extends Config.AnyConfig, E = never, R = never> = Stream.Stream<
  Part<Config>,
  E,
  R
>;

/**
 * The parts of a trajectory held by index, read with `Config`.
 *
 * **When to use**
 *
 * Use when the parts are already read and a caller needs their count, one part
 * by index, and the parts as a stream.
 *
 * **Details**
 *
 * `length` counts the parts held.
 * `at` reads the part at a zero-based index.
 * A negative index and an index past the end hold nothing, so `at` returns `none`.
 * `E` and `R` are the error and the requirements of one read.
 *
 * @see {@link asStream} for reading those parts as a stream.
 * @see {@link TrajectoryFile} for a buffer that names its id and config.
 * @stability stable
 * @category models
 */
export interface TrajectoryBuffer<Config extends Config.AnyConfig, E = never, R = never> {
  readonly length: number;
  readonly at: (index: number) => Effect.Effect<Option.Option<Part<Config>>, E, R>;
}

/**
 * Reads the parts of a {@link TrajectoryBuffer} as a {@link TrajectoryStream}.
 *
 * **Details**
 *
 * The stream reads `at(0)` through `at(length - 1)` in order, one part at a time.
 * An index that holds nothing is skipped.
 * The length is read where the stream runs, not where it is built.
 *
 * @see {@link TrajectoryBuffer} for the parts the stream reads.
 * @see {@link make} for naming the stream with an id and its config.
 * @stability stable
 * @category constructors
 */
export const asStream = <Config extends Config.AnyConfig, E = never, R = never>(
  buffer: TrajectoryBuffer<Config, E, R>,
): TrajectoryStream<Config, E, R> =>
  Stream.suspend(() => Stream.range(0, buffer.length - 1)).pipe(
    Stream.mapEffect((index) => buffer.at(index)),
    Stream.filterMap((part) =>
      Option.isSome(part) ? Result.succeed(part.value) : Result.failVoid,
    ),
  );

/**
 * A stream of {@link Part} named by `Id` and read with `Config`.
 *
 * **Details**
 *
 * The value is that stream.
 * `id` names it.
 * The other fields repeat that config.
 * `E` and `R` are the error and the requirements of the stream.
 *
 * @see {@link make} for binding the id and the config.
 * @see {@link TrajectoryStream} for the stream before that binding.
 * @stability stable
 * @category models
 */
export type Trajectory<
  Id extends string = string,
  Config extends Config.AnyConfig = Config.AnyConfig,
  E = never,
  R = never,
> = TrajectoryStream<Config, E, R> & Readonly<{ id: Id }> & Readonly<Config>;

/**
 * A {@link TrajectoryBuffer} that names its id and its config.
 *
 * **When to use**
 *
 * Use when a buffer is the whole trajectory in hand, with no source to replay.
 *
 * **Details**
 *
 * `asStream` reads its parts, and `id` names it.
 * The other fields repeat the config its parts are read with.
 *
 * @see {@link TrajectoryBuffer} for the parts alone.
 * @see {@link Trajectory} for the same id and config over a stream.
 * @stability stable
 * @category models
 */
export type TrajectoryFile<
  Id extends string = string,
  Config extends Config.AnyConfig = Config.AnyConfig,
> = TrajectoryBuffer<Config> & Readonly<{ id: Id }> & Readonly<Config>;

/**
 * Returns a function from an id and `config` to a bound part stream.
 *
 * **When to use**
 *
 * Use when a part stream should carry its id and its config.
 *
 * **Details**
 *
 * `make(id, config)(stream)` keeps the given id.
 * `make(config)(stream)` assigns a new uuid v7.
 * The result is the stream plus `id` and the fields of `config`.
 * `stream.pipe(make(config))` binds the same way.
 *
 * **Gotchas**
 *
 * `make` does not read the stream.
 * Each `make(config)` call assigns a different id.
 *
 * **Example** (Naming a trajectory)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 * import { Config, Prompt, Trajectory } from "@trajs/core"
 *
 * const config = Config.config()
 * const part = Trajectory.parts(config)
 * const trajectory = Trajectory.make("run-1", config)(
 *   Stream.make(part.prompt(Prompt.make("Hello"))),
 * )
 *
 * trajectory.id // => "run-1"
 * ```
 *
 * @see {@link parts} for building the parts.
 * @see {@link Trajectory} for the bound stream.
 * @stability stable
 * @category constructors
 */
export function make<Id extends string, Config extends Config.AnyConfig>(
  id: Id,
  config: Config,
): <E, R>(stream: TrajectoryStream<Config, E, R>) => Trajectory<Id, Config, E, R>;
export function make<Config extends Config.AnyConfig>(
  config: Config,
): <E, R>(stream: TrajectoryStream<Config, E, R>) => Trajectory<string, Config, E, R>;
export function make<Config extends Config.AnyConfig>(
  ...args: [id: string, config: Config] | [config: Config]
) {
  if (args.length === 1) {
    const [config] = args;

    return attach(uuid(), config);
  }

  const [id, config] = args;

  return attach(id, config);
}
