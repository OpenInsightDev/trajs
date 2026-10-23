import { ByteStore } from "@trajs/utils";
import { DateTime, Effect, Schema, Stream } from "effect";

import * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import * as Cache from "#/internal/cache.ts";
import { Timestamp, Uuid } from "#/internal/schema.ts";
import { attach, uuid } from "#/internal/trajectory.ts";
import type { Select } from "#/internal/types.ts";
import * as Metric from "#/Metric.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Toolkit from "#/Toolkit.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

const extraField = <K extends ExtraKit.Any, P extends Extra.Part>(extrakit: K, part: P) =>
  Extra.ExtraRecord(extrakit, part).pipe(Schema.withDecodingDefault(Effect.succeed({})));

export const PromptPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Prompt", {
    messages: Schema.Array(Prompt.Message),
    extra: extraField(extrakit, "prompt"),
    sessionId: Schema.optional(Schema.String),
    uuid: Uuid,
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  });

export type PromptPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof PromptPart<K>>
>;

export type PromptPartEncoded = Schema.Codec.Encoded<ReturnType<typeof PromptPart<ExtraKit.Any>>>;

export const mainSessionId = "main";

const MainSession = Schema.TaggedStruct("main", { id: Schema.Literal(mainSessionId) });

const SubSession = Schema.TaggedStruct("sub", { id: Schema.String, fork: Uuid });

export const SessionPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Session", {
    type: Schema.Union([MainSession, SubSession]),
    extra: extraField(extrakit, "session"),
    uuid: Uuid,
  });

export type SessionPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof SessionPart<K>>
>;

export type SessionPartEncoded = Schema.Codec.Encoded<ReturnType<typeof SessionPart<ExtraKit.Any>>>;

const responseFields = {
  timestamp: Timestamp,
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

export type ResponsePart<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
  Stream extends boolean,
> = Schema.Schema.Type<AllResponseParts<Toolkit, Extras, Stream>>;

export type ResponsePartEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponsePart<Toolkit.Any, ExtraKit.Any, true>>
>;

export const EventPart = <K extends EventKit.Any>(eventkit: K) =>
  Schema.TaggedStruct("Event", {
    event: Event.EventParts(eventkit),
    timestamp: Timestamp,
    sessionId: Schema.optional(Schema.String),
    uuid: Uuid,
  });

export type EventPart<K extends EventKit.Any> = Schema.Schema.Type<ReturnType<typeof EventPart<K>>>;

export type EventPartEncoded = Schema.Codec.Encoded<ReturnType<typeof EventPart<EventKit.Any>>>;

export const MetricPart = <K extends MetricKit.Any>(metrickit: K) =>
  Schema.TaggedStruct("Metric", {
    metric: Metric.MetricParts(metrickit),
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  });

export type MetricPart<K extends MetricKit.Any> = Schema.Schema.Type<
  ReturnType<typeof MetricPart<K>>
>;

export type MetricPartEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricPart<MetricKit.Any>>>;

export interface Parts<Config extends Config.AnyConfig> {
  readonly prompt: (
    prompt: Prompt.Prompt,
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
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
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config.ExtrasOf<Config>, "response">,
  ) => ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>;

  readonly event: (
    event: Event.EventParts<Config.EventsOf<Config>>,
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly uuid?: string;
    },
  ) => EventPart<Config["eventkit"]>;

  readonly metric: (
    metric: Metric.MetricParts<Config.MetricsOf<Config>>,
    options?: { readonly timestamp?: DateTime.Utc },
  ) => MetricPart<Config["metrickit"]>;
}

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
    prompt: (prompt, { sessionId, timestamp, uuid, ...extra } = {}) =>
      Prompt.make({ messages: prompt.content, sessionId, extra, timestamp, uuid }),
    mainSession: ({ uuid, ...extra } = {}) =>
      Session.make({ type: MainSession.make({ id: mainSessionId }), extra, uuid }),
    subSession: (id, { fork, uuid, ...extra }) =>
      Session.make({ type: SubSession.make({ id, fork }), extra, uuid }),
    // SAFETY: the schema uses the same configuration as the return type.
    // TypeScript cannot resolve the conditional response type for a generic configuration.
    response: (response, { sessionId, timestamp, uuid, ...extra } = {}) =>
      Response.make({ response, sessionId, extra, timestamp, uuid }) as ResponsePart<
        Config["toolkit"],
        Config["extrakit"],
        Config["stream"]
      >,
    event: (event, { sessionId, timestamp, uuid } = {}) =>
      Event.make({ event, sessionId, timestamp, uuid }),
    metric: (metric, { timestamp } = {}) => Metric.make({ metric, timestamp }),
  };
};

export type Part<Config extends Config.AnyConfig> =
  | PromptPart<Config["extrakit"]>
  | SessionPart<Config["extrakit"]>
  | ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>
  | EventPart<Config["eventkit"]>
  | MetricPart<Config["metrickit"]>;

export type TrajectoryStream<Config extends Config.AnyConfig, E = never, R = never> = Stream.Stream<
  Part<Config>,
  E,
  R
>;

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

export interface CacheOptions {
  readonly capacity?: number | "unbounded";
}

type Cached<Id extends string, Config extends Config.AnyConfig, E, R> = Effect.Effect<
  Trajectory<
    Id,
    Config,
    TrajectoryError | ByteStore.ByteStoreError,
    Config.DecodingServices<Config>
  >,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.EncodingServices<Config> | ByteStore.ByteStore
>;

export function cache<Id extends string, Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory<Id, Config, E, R>,
  options?: CacheOptions,
): Cached<Id, Config, E, R>;
export function cache(
  options?: CacheOptions,
): <Id extends string, Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory<Id, Config, E, R>,
) => Cached<Id, Config, E, R>;
export function cache<Config extends Config.AnyConfig, E, R>(
  ...args:
    | [trajectory: Trajectory<string, Config, E, R>, options?: CacheOptions | undefined]
    | [options?: CacheOptions | undefined]
) {
  if (args.length === 2) {
    const [trajectory, options] = args;

    return Cache.cache(trajectory, options);
  }

  const [given] = args;

  if (given !== undefined && Stream.isStream(given)) {
    return Cache.cache(given);
  }

  return (trajectory: Trajectory<string, Config, E, R>) => Cache.cache(trajectory, given);
}
