/**
 * A named stream of parts, read with one config.
 *
 * {@link make} binds an id and a config to a stream of {@link Part}.
 * {@link parts} builds those parts.
 * The part schemas read a trajectory back from storage.
 *
 * @stability stable
 */

import { DateTime, Effect, Schema, Stream } from "effect";

import * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { Timestamp, Uuid } from "#/internal/schema.ts";
import { attach, uuid } from "#/internal/trajectory.ts";
import type { Select } from "#/internal/types.ts";
import * as Metric from "#/Metric.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Toolkit from "#/Toolkit.ts";

const extraField = <K extends ExtraKit.Any, P extends Extra.Part>(extrakit: K, part: P) =>
  Extra.ExtraRecord(extrakit, part).pipe(Schema.withDecodingDefault(Effect.succeed({})));

/**
 * Schema for a prompt part of `extrakit`.
 *
 * **When to use**
 *
 * Use when a stored prompt must be decoded with the extras of one kit.
 *
 * **Details**
 *
 * `messages` holds the content of a {@link Prompt.Prompt}.
 * `extra` decodes as `{}` when the payload omits it.
 * A missing `sessionId` means {@link mainSessionId}.
 * `timestamp` is the moment the part was produced.
 * A missing `startTimestamp` leaves that moment alone.
 * `uuid` is a uuid v7. Construction fills one when the caller omits it.
 *
 * **Gotchas**
 *
 * `timestamp` stays absent when omitted.
 * {@link ResponsePart} fills an omitted `timestamp` with the current time.
 *
 * @see {@link parts} for building a prompt part from a {@link Prompt.Prompt}.
 * @see {@link PromptPartOf} for the prompt part of a config.
 * @stability stable
 * @category schemas
 */
export const PromptPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Prompt", {
    messages: Schema.Array(Prompt.Message),
    extra: extraField(extrakit, "prompt"),
    sessionId: Schema.optional(Schema.String),
    uuid: Uuid,
    timestamp: Schema.optional(Timestamp),
    startTimestamp: Schema.optional(Timestamp),
  });

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

const SubSession = Schema.TaggedStruct("sub", { id: Schema.String, fork: Uuid });

/**
 * Schema for a session declaration of `extrakit`.
 *
 * **When to use**
 *
 * Use when a stored session declaration must be decoded with the extras of one kit.
 *
 * **Details**
 *
 * `type` is `main` or `sub`.
 * `main` carries {@link mainSessionId}.
 * `sub` carries its own `id` and a `fork` uuid.
 * `extra` decodes as `{}` when the payload omits it.
 * `uuid` is a uuid v7. Construction fills one when the caller omits it.
 *
 * **Gotchas**
 *
 * A session declaration has no `timestamp` and no `sessionId`.
 *
 * @see {@link parts} for `mainSession` and `subSession`.
 * @see {@link SessionPartOf} for the session part of a config.
 * @stability stable
 * @category schemas
 */
export const SessionPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Session", {
    type: Schema.Union([MainSession, SubSession]),
    extra: extraField(extrakit, "session"),
    uuid: Uuid,
  });

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

const responseFields = {
  timestamp: Timestamp,
  startTimestamp: Schema.optional(Timestamp),
  sessionId: Schema.optional(Schema.String),
  uuid: Uuid,
};

const NonStreamResponsePart = <T extends Toolkit.Any, K extends ExtraKit.Any>(
  toolkit: T,
  extrakit: K,
) =>
  Schema.TaggedStruct("Response", {
    response: Schema.Union([Response.Part(toolkit), Response.Part()]),
    extra: extraField(extrakit, "response"),
    ...responseFields,
  });

const StreamResponsePart = <T extends Toolkit.Any, K extends ExtraKit.Any>(
  toolkit: T,
  extrakit: K,
) =>
  Schema.TaggedStruct("Response", {
    response: Schema.Union([Response.AllParts(toolkit), Response.AllParts()]),
    extra: extraField(extrakit, "response"),
    ...responseFields,
  });

type AllResponseParts<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
  Stream extends boolean,
> = Select<
  Stream,
  ReturnType<typeof StreamResponsePart<Toolkit, Extras>>,
  ReturnType<typeof NonStreamResponsePart<Toolkit, Extras>>
>;

/**
 * Schema for a response part of `toolkit` and `extrakit`.
 *
 * **When to use**
 *
 * Use when decoding must follow the `stream` variant.
 *
 * **Details**
 *
 * `stream: true` reads {@link Response.AllParts}, streaming increments included.
 * `stream: false` reads a finished {@link Response.Part}.
 * Both variants also accept parts built for tools beyond `toolkit`.
 * `extra` decodes as `{}` when the payload omits it.
 * `timestamp` is required. Construction uses the current time when the caller omits it.
 * A missing `startTimestamp` leaves that moment alone.
 * A missing `sessionId` means {@link mainSessionId}.
 * `uuid` is a uuid v7. Construction fills one when the caller omits it.
 *
 * @see {@link parts} for building a response part.
 * @see {@link ResponsePartOf} for the response part of a config.
 * @stability stable
 * @category schemas
 */
export const ResponsePart = <
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
  Stream extends boolean,
>({
  toolkit,
  extrakit,
  stream,
}: {
  toolkit: Toolkit;
  extrakit: Extras;
  stream: Stream;
}): AllResponseParts<Toolkit, Extras, Stream> =>
  // SAFETY: the conditional return type and runtime branch both select response parts using `stream`.
  (stream
    ? StreamResponsePart(toolkit, extrakit)
    : NonStreamResponsePart(toolkit, extrakit)) as AllResponseParts<Toolkit, Extras, Stream>;

/**
 * A response part decoded for `Toolkit`, `Extras`, and `Stream`.
 *
 * @see {@link ResponsePart} for the schema.
 * @stability stable
 * @category models
 */
export type ResponsePart<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
  Stream extends boolean,
> = Schema.Schema.Type<AllResponseParts<Toolkit, Extras, Stream>>;

/**
 * The wire form of a streaming {@link ResponsePart}.
 *
 * **Gotchas**
 *
 * The alias always uses `stream: true`.
 * A finished response is not a separate wire type.
 *
 * @stability stable
 * @category encoding
 */
export type ResponsePartEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponsePart<Toolkit.Any, ExtraKit.Any, true>>
>;

/**
 * Schema for an event part of `eventkit`.
 *
 * **When to use**
 *
 * Use when a stored event must be decoded with the events of one kit.
 *
 * **Details**
 *
 * `event` is one event the kit declares.
 * `timestamp` is required. Construction uses the current time when the caller omits it.
 * A missing `startTimestamp` leaves that moment alone.
 * A missing `sessionId` means {@link mainSessionId}.
 * `uuid` is a uuid v7. Construction fills one when the caller omits it.
 *
 * **Gotchas**
 *
 * An event part carries no extras.
 *
 * @see {@link parts} for building an event part.
 * @see {@link EventPartOf} for the event part of a config.
 * @stability stable
 * @category schemas
 */
export const EventPart = <K extends EventKit.Any>(eventkit: K) =>
  Schema.TaggedStruct("Event", {
    event: Event.EventParts(eventkit),
    timestamp: Timestamp,
    startTimestamp: Schema.optional(Timestamp),
    sessionId: Schema.optional(Schema.String),
    uuid: Uuid,
  });

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
 * Schema for a metric part of `metrickit`.
 *
 * **When to use**
 *
 * Use when a stored metric must be decoded with the metrics of one kit.
 *
 * **Details**
 *
 * `metric` is one metric the kit declares.
 * `timestamp` and `startTimestamp` stay absent when omitted.
 *
 * **Gotchas**
 *
 * A metric part has no `uuid`, no `sessionId`, and no extras.
 *
 * @see {@link parts} for building a metric part.
 * @see {@link MetricPartOf} for the metric part of a config.
 * @stability stable
 * @category schemas
 */
export const MetricPart = <K extends MetricKit.Any>(metrickit: K) =>
  Schema.TaggedStruct("Metric", {
    metric: Metric.MetricParts(metrickit),
    timestamp: Schema.optional(Timestamp),
    startTimestamp: Schema.optional(Timestamp),
  });

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
    response: ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>["response"],
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly startTimestamp?: DateTime.Utc;
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config.ExtrasOf<Config>, "response">,
  ) => ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>;

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
    stream: config.stream,
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
    // TypeScript cannot resolve the conditional response type for a generic configuration.
    response: (response, { sessionId, timestamp, startTimestamp, uuid, ...extra } = {}) =>
      Response.make({
        response,
        sessionId,
        extra,
        timestamp,
        startTimestamp,
        uuid,
      }) as ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>,
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
  | ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>
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
  Config["extrakit"],
  Config["stream"]
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
> = TrajectoryStream<Config, E, R> &
  Readonly<{
    id: Id;
  }> &
  Readonly<Config>;

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
 * const config = Config.config({ stream: false })
 * const part = Trajectory.parts(config)
 * const trajectory = Trajectory.make("run-1", config)(
 *   Stream.make(part.prompt(Prompt.make("Hello"))),
 * )
 *
 * trajectory.id // => "run-1"
 * trajectory.stream // => false
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
