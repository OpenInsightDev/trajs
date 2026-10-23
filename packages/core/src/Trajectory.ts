import { type ByteStore, type ByteStoreError } from "@trajs/utils/ByteStore";
import { DateTime, Effect, Schema, Scope, Stream } from "effect";

import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { cached } from "#/internal/cache.ts";
import type { EncodingServices, Readable } from "#/internal/parts.ts";
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

/**
 * Schema for validation and encoding of prompt parts.
 * Extra data is typed by an {@link ExtraKit.Kit}.
 *
 * @category schemas
 */
export const PromptPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Prompt", {
    messages: Schema.Array(Prompt.Message),
    extra: extraField(extrakit, "prompt"),
    sessionId: Schema.optional(Schema.String),
    uuid: Uuid,
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  });

/**
 * A prompt part.
 * It carries the messages of one prompt and the session they were sent in.
 * {@link parts} builds one for each prompt a program sends.
 * Extra data is typed by an {@link ExtraKit.Kit}.
 *
 * @category models
 */
export type PromptPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof PromptPart<K>>
>;

/**
 * Encoded representation of prompt parts for serialization.
 *
 * @category models
 */
export type PromptPartEncoded = Schema.Codec.Encoded<ReturnType<typeof PromptPart<ExtraKit.Any>>>;

/**
 * The ID of the main {@link SessionPart}.
 *
 * @category constants
 */
export const mainSessionId = "main";

const MainSession = Schema.TaggedStruct("main", { id: Schema.Literal(mainSessionId) });

const SubSession = Schema.TaggedStruct("sub", { id: Schema.String, fork: Uuid });

/**
 * Schema for validation and encoding of session parts.
 * Extra data is typed by an {@link ExtraKit.Kit}.
 *
 * @category schemas
 */
export const SessionPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Session", {
    type: Schema.Union([MainSession, SubSession]),
    extra: extraField(extrakit, "session"),
    uuid: Uuid,
  });

/**
 * A session part.
 * It opens a session, either the main one or a sub-session of a parent.
 * A sub-session carries its own id and the uuid of the parent session part.
 * Parts of the session state its id in `sessionId`.
 * Extra data is typed by an {@link ExtraKit.Kit}.
 *
 * @category models
 */
export type SessionPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof SessionPart<K>>
>;

/**
 * Encoded representation of session parts for serialization.
 *
 * @category models
 */
export type SessionPartEncoded = Schema.Codec.Encoded<ReturnType<typeof SessionPart<ExtraKit.Any>>>;

const responseFields = {
  timestamp: Timestamp,
  sessionId: Schema.optional(Schema.String),
  uuid: Uuid,
};

// A response part is read by the toolkit schema first.
// A fallback schema types every other tool as `unknown`.
// Encoding prefers the toolkit schema, so each tool keeps its own encoders.

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
 * Schema for validation and encoding of response parts.
 * The `stream` flag selects the streaming variant.
 * The response is typed by a {@link Toolkit.Toolkit}.
 * Extra data is typed by an {@link ExtraKit.Kit}.
 *
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
  // SAFETY: `AllResponseParts` selects the codec pair by `Stream`.
  // The selection is the branch taken here.
  (stream
    ? StreamResponsePart(toolkit, extrakit)
    : NonStreamResponsePart(toolkit, extrakit)) as AllResponseParts<Toolkit, Extras, Stream>;

/**
 * A response part.
 * It carries what a model answered to one prompt, with the session it answered in.
 * A streaming part carries increments, and a whole one the finished response.
 * The response is typed by a {@link Toolkit.Toolkit}.
 * Extra data is typed by an {@link ExtraKit.Kit}.
 *
 * @category models
 */
export type ResponsePart<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
  Stream extends boolean,
> = Schema.Schema.Type<AllResponseParts<Toolkit, Extras, Stream>>;

/**
 * Encoded representation of response parts for serialization.
 *
 * @category models
 */
export type ResponsePartEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponsePart<Toolkit.Any, ExtraKit.Any, true>>
>;

/**
 * Schema for validation and encoding of event parts.
 * Events are typed by an {@link EventKit.Kit}.
 *
 * @category schemas
 */
export const EventPart = <K extends EventKit.Any>(kit: K) =>
  Schema.TaggedStruct("Event", {
    event: Event.EventParts(kit),
    timestamp: Timestamp,
    sessionId: Schema.optional(Schema.String),
    uuid: Uuid,
  });

/**
 * An event part.
 * It records what a program stated of itself, apart from model calls.
 * {@link Event.encode} gives a read trajectory its event kit.
 * Events are typed by an {@link EventKit.Kit}.
 *
 * @category models
 */
export type EventPart<K extends EventKit.Any> = Schema.Schema.Type<ReturnType<typeof EventPart<K>>>;

/**
 * Encoded representation of event parts for serialization.
 *
 * @category models
 */
export type EventPartEncoded = Schema.Codec.Encoded<ReturnType<typeof EventPart<EventKit.Any>>>;

/**
 * Schema for validation and encoding of metric parts.
 * The producer output and failure are typed by a {@link MetricKit.Kit}.
 *
 * @category schemas
 */
export const MetricPart = <K extends MetricKit.Any>(kit: K) =>
  Schema.TaggedStruct("Metric", {
    metric: Metric.MetricParts(kit),
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  });

/**
 * A metric part.
 * It carries one metric's output or failure, tagged by the metric.
 * {@link Metric.produce} derives one part for each metric of a kit.
 * `attach` names the uuid of each part the metric is about.
 * The output and failure are typed by a {@link MetricKit.Kit}.
 *
 * @category models
 */
export type MetricPart<K extends MetricKit.Any> = Schema.Schema.Type<
  ReturnType<typeof MetricPart<K>>
>;

/**
 * Encoded representation of metric parts for serialization.
 *
 * @category models
 */
export type MetricPartEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricPart<MetricKit.Any>>>;

/**
 * The constructors for the parts of a {@link Config}.
 * `fork` names a session part by uuid, and a sub-session branches from it.
 *
 * @category models
 */
export interface Parts<Config extends AnyConfig> {
  readonly prompt: (
    prompt: Prompt.Prompt,
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config["extrakit"]["extra"], "prompt">,
  ) => PromptPart<Config["extrakit"]>;

  readonly mainSession: (
    options?: {
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config["extrakit"]["extra"], "session">,
  ) => SessionPart<Config["extrakit"]>;

  readonly subSession: (
    id: string,
    options: {
      readonly fork: string;
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config["extrakit"]["extra"], "session">,
  ) => SessionPart<Config["extrakit"]>;

  readonly response: (
    response: ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>["response"],
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly uuid?: string;
    } & Extra.ExtraRecord<Config["extrakit"]["extra"], "response">,
  ) => ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>;

  readonly event: (
    event: Event.EventParts<Config["eventkit"]["events"]>,
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly uuid?: string;
    },
  ) => EventPart<Config["eventkit"]>;

  readonly metric: (
    metric: Metric.MetricParts<Config["metrickit"]["metrics"]>,
    options?: { readonly timestamp?: DateTime.Utc },
  ) => MetricPart<Config["metrickit"]>;
}

/**
 * Builds the constructors for the parts of a {@link Config}.
 * The constructors fill an omitted `uuid` with a new one.
 *
 * @category constructors
 */
export const parts = <Config extends AnyConfig>(config: Config): Parts<Config> => {
  const prompt = PromptPart(config.extrakit);
  const session = SessionPart(config.extrakit);

  const response = ResponsePart({
    toolkit: config.toolkit,
    extrakit: config.extrakit,
    stream: config.stream,
  });

  const event = EventPart(config.eventkit);
  const metric = MetricPart(config.metrickit);

  return {
    prompt: (asked, { sessionId, timestamp, uuid, ...extra } = {}) =>
      prompt.make({ messages: asked.content, sessionId, extra, timestamp, uuid }),
    mainSession: ({ uuid, ...extra } = {}) =>
      session.make({ type: MainSession.make({ id: mainSessionId }), extra, uuid }),
    subSession: (id, { fork, uuid, ...extra }) =>
      session.make({ type: SubSession.make({ id, fork }), extra, uuid }),
    // SAFETY: the schema matches the config's variant.
    // TypeScript reads the part as the streaming variant under a type parameter.
    response: (answered, { sessionId, timestamp, uuid, ...extra } = {}) =>
      response.make({ response: answered, sessionId, extra, timestamp, uuid }) as ResponsePart<
        Config["toolkit"],
        Config["extrakit"],
        Config["stream"]
      >,
    event: (given, { sessionId, timestamp, uuid } = {}) =>
      event.make({ event: given, sessionId, timestamp, uuid }),
    metric: (given, { timestamp } = {}) => metric.make({ metric: given, timestamp }),
  };
};

/**
 * The kits of a trajectory and its response variant.
 * {@link Toolkit.Toolkit} types response parts, {@link EventKit.Kit} event parts and {@link MetricKit.Kit} metric parts.
 * {@link ExtraKit.Kit} types the extra data of parts, and `stream` selects the response variant.
 *
 * @category models
 */
export interface Config<
  Stream extends boolean = never,
  Toolkit extends Toolkit.Any = never,
  Events extends EventKit.Any = never,
  Metrics extends MetricKit.Any = never,
  Extras extends ExtraKit.Any = never,
> {
  stream: Stream;
  toolkit: Toolkit;
  eventkit: Events;
  metrickit: Metrics;
  extrakit: Extras;
}

/**
 * A config with any variant and any kit.
 *
 * @category models
 */
export type AnyConfig = Config<boolean, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A config with non-streaming responses.
 *
 * @category models
 */
export type NonStreamConfig = Config<false, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A config of empty kits, for a trajectory read without typing its parts.
 *
 * @category models
 */
export type UnknownConfig = Config<
  true,
  Toolkit.Empty,
  EventKit.Empty,
  MetricKit.Empty,
  ExtraKit.Empty
>;

/**
 * The config a part is read with when no other is stated.
 *
 * @see {@link config} for a config stated by the caller.
 * @category constructors
 */
export const anyConfig: AnyConfig = {
  stream: true,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
};

/**
 * Builds a config from a partial one.
 * Unstated fields take their defaults.
 * `stream` defaults to `true`, and each kit to empty.
 *
 * @category constructors
 */
export const config = <
  const Stream extends boolean = true,
  Toolkit extends Toolkit.Any = Toolkit.Empty,
  Events extends EventKit.Any = EventKit.Empty,
  Metrics extends MetricKit.Any = MetricKit.Empty,
  Extras extends ExtraKit.Any = ExtraKit.Empty,
>(
  config: Partial<Config<Stream, Toolkit, Events, Metrics, Extras>> = {},
): Config<Stream, Toolkit, Events, Metrics, Extras> =>
  // SAFETY: an unstated field takes its type parameter's default, the empty kit or `true`.
  ({
    stream: config.stream ?? true,
    toolkit: config.toolkit ?? Toolkit.empty,
    eventkit: config.eventkit ?? EventKit.empty,
    metrickit: config.metrickit ?? MetricKit.empty,
    extrakit: config.extrakit ?? ExtraKit.empty,
  }) as Config<Stream, Toolkit, Events, Metrics, Extras>;

/**
 * One part of a trajectory, either a {@link PromptPart}, {@link SessionPart}, {@link ResponsePart}, {@link EventPart} or {@link MetricPart}.
 * Parts arrive in the order they were produced.
 *
 * @category models
 */
export type Part<Config extends AnyConfig> =
  | PromptPart<Config["extrakit"]>
  | SessionPart<Config["extrakit"]>
  | ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>
  | EventPart<Config["eventkit"]>
  | MetricPart<Config["metrickit"]>;

/**
 * A stream of {@link Part} values.
 * Reading it twice runs its source twice.
 *
 * @see {@link Trajectory} for a stream that also carries its config and ID.
 * @category models
 */
export type TrajectoryStream<Config extends AnyConfig, E = never, R = never> = Stream.Stream<
  Part<Config>,
  E,
  R
>;

/**
 * A stream of parts together with its {@link Config} and ID.
 * Storage reads the kits off the trajectory rather than from the caller.
 * The ID names the trajectory, not the key a store saves it under.
 *
 * @category models
 */
export type Trajectory<
  Id extends string = string,
  Config extends AnyConfig = AnyConfig,
  E = never,
  R = never,
> = TrajectoryStream<Config, E, R> &
  Readonly<Config> & {
    readonly id: Id;
  };

/**
 * Attaches a {@link Config} and an ID to a {@link TrajectoryStream}.
 * An omitted ID is a new uuid.
 *
 * @category constructors
 */
export function make<Id extends string, Config extends AnyConfig>(
  id: Id,
  config: Config,
): <E, R>(stream: TrajectoryStream<Config, E, R>) => Trajectory<Id, Config, E, R>;
export function make<Config extends AnyConfig>(
  config: Config,
): <E, R>(stream: TrajectoryStream<Config, E, R>) => Trajectory<string, Config, E, R>;
export function make<Config extends AnyConfig>(
  ...args: [id: string, config: Config] | [config: Config]
): <E, R>(stream: TrajectoryStream<Config, E, R>) => Trajectory<string, Config, E, R> {
  if (args.length === 1) {
    const [config] = args;

    return attach(undefined, config);
  }

  const [id, config] = args;

  return attach(id, config);
}

/**
 * Options for {@link cache}.
 * `capacity` states how many parts stay in memory, `"unbounded"` by default.
 * Parts beyond that window are written to the {@link ByteStore}.
 *
 * @category models
 */
export interface CacheOptions {
  readonly capacity?: number | "unbounded" | undefined;
}

type Cached<Id extends string, Config extends AnyConfig, E, R> = Effect.Effect<
  Trajectory<Id, Config, E | TrajectoryError | ByteStoreError, never>,
  E | TrajectoryError | ByteStoreError,
  Scope.Scope | R | EncodingServices<Config> | ByteStore
>;

/**
 * Caches a {@link Trajectory}, so that each reader reads it from its first part.
 * The source is read as soon as the effect runs.
 * The cache releases with the scope.
 *
 * @category constructors
 */
export function cache<Id extends string, Config extends AnyConfig, E, R>(
  trajectory: Trajectory<Id, Config, E, R> & Readable<Config>,
  options?: CacheOptions,
): Cached<Id, Config, E, R>;
export function cache(
  options?: CacheOptions,
): <Id extends string, Config extends AnyConfig, E, R>(
  trajectory: Trajectory<Id, Config, E, R> & Readable<Config>,
) => Cached<Id, Config, E, R>;
export function cache<Config extends AnyConfig, E, R>(
  ...args:
    | [
        trajectory: Trajectory<string, Config, E, R> & Readable<Config>,
        options?: CacheOptions | undefined,
      ]
    | [options?: CacheOptions | undefined]
):
  | Cached<string, Config, E, R>
  | ((
      trajectory: Trajectory<string, Config, E, R> & Readable<Config>,
    ) => Cached<string, Config, E, R>) {
  if (args.length === 2) {
    const [trajectory, options] = args;

    return cached(trajectory, options);
  }

  const [given] = args;

  // A trajectory is a stream.
  // Its options are a record, so one argument alone states either.
  if (given !== undefined && Stream.isStream(given)) {
    return cached(given);
  }

  return (trajectory) => cached(trajectory, given);
}

/**
 * The {@link Config} of a merged trajectory.
 * Its kits merge both kits, and it streams if either trajectory streams.
 *
 * @category models
 */
export type MergedConfig<Left extends AnyConfig, Right extends AnyConfig> = Config<
  Left["stream"] | Right["stream"],
  Toolkit.Toolkit<Toolkit.MergedTools<readonly [Left["toolkit"], Right["toolkit"]]>>,
  EventKit.Merged<readonly [Left["eventkit"], Right["eventkit"]]>,
  MetricKit.Merged<readonly [Left["metrickit"], Right["metrickit"]]>,
  ExtraKit.Merged<readonly [Left["extrakit"], Right["extrakit"]]>
>;

/**
 * Merges two {@link Trajectory} values into one stream.
 * The parts of `left` come before the parts of `right`.
 * A merged trajectory without an ID takes a new uuid.
 *
 * @category constructors
 */
export function merge<Id extends string>(
  id: Id,
): <Left extends AnyConfig, Right extends AnyConfig, E, R, E2, R2>(
  left: Trajectory<string, Left, E, R>,
  right: Trajectory<string, Right, E2, R2>,
) => Trajectory<Id, MergedConfig<Left, Right>, E | E2, R | R2>;
export function merge<Left extends AnyConfig, Right extends AnyConfig, E, R, E2, R2>(
  left: Trajectory<string, Left, E, R>,
  right: Trajectory<string, Right, E2, R2>,
): Trajectory<string, MergedConfig<Left, Right>, E | E2, R | R2>;
export function merge<Left extends AnyConfig, Right extends AnyConfig, E, R, E2, R2>(
  ...args:
    | [id: string]
    | [left: Trajectory<string, Left, E, R>, right: Trajectory<string, Right, E2, R2>]
):
  | ((
      left: Trajectory<string, Left, E, R>,
      right: Trajectory<string, Right, E2, R2>,
    ) => Trajectory<string, MergedConfig<Left, Right>, E | E2, R | R2>)
  | Trajectory<string, MergedConfig<Left, Right>, E | E2, R | R2> {
  if (args.length === 1) {
    const [id] = args;

    return (left, right) => merged(id, left, right);
  }

  const [left, right] = args;

  return merged(uuid(), left, right);
}

const merged = <Id extends string, Left extends AnyConfig, Right extends AnyConfig, E, R, E2, R2>(
  id: Id,
  left: Trajectory<string, Left, E, R>,
  right: Trajectory<string, Right, E2, R2>,
): Trajectory<Id, MergedConfig<Left, Right>, E | E2, R | R2> => {
  // Each kit is merged.
  // The variant streams if either trajectory streams.
  const stated = config({
    stream: left.stream || right.stream,
    toolkit: Toolkit.merge(left.toolkit, right.toolkit),
    eventkit: EventKit.merge(left.eventkit, right.eventkit),
    metrickit: MetricKit.merge(left.metrickit, right.metrickit),
    extrakit: ExtraKit.merge(left.extrakit, right.extrakit),
  });

  // SAFETY: both streams hold parts of the merged config.
  // A whole response part is also a streaming one, so either variant reads both.
  return make(
    id,
    stated,
  )(Stream.concat(left, right) as TrajectoryStream<MergedConfig<Left, Right>, E | E2, R | R2>);
};
