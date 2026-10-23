/**
 * Trajectories containing prompt, response, session, event, and metric parts.
 * Provides {@link parts} to construct parts, {@link make} to construct trajectories, and {@link cache} to cache them.
 */

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
 * Builds a codec for prompt parts and their extra data.
 *
 * **Details**
 *
 * The supplied {@link ExtraKit.Kit} declares the prompt extra data.
 * Decoding a missing `extra` field produces an empty record.
 * Timestamps are optional and encode as UTC strings.
 *
 * @see {@link parts} for constructing parts without encoding them
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
 * The messages supplied to a model call, with their session and extra data.
 *
 * **Details**
 *
 * The messages may include conversation history, not only the latest user message.
 * A prompt part does not imply a successful response.
 * An omitted `sessionId` places the prompt in the main session.
 * The `uuid` identifies this part, independently of its session.
 * Extra data belongs in `extra`, as declared by {@link ExtraKit.Kit}.
 *
 * @category models
 */
export type PromptPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof PromptPart<K>>
>;

/**
 * The encoded representation of a {@link PromptPart}.
 *
 * Decode with the matching {@link ExtraKit.Kit} to recover the extra data.
 *
 * @category models
 */
export type PromptPartEncoded = Schema.Codec.Encoded<ReturnType<typeof PromptPart<ExtraKit.Any>>>;

/**
 * The main session ID for prompt, response, and event parts without a `sessionId`.
 *
 * The main session can be read without an explicit {@link SessionPart} declaration.
 *
 * @category constants
 */
export const mainSessionId = "main";

const MainSession = Schema.TaggedStruct("main", { id: Schema.Literal(mainSessionId) });

const SubSession = Schema.TaggedStruct("sub", { id: Schema.String, fork: Uuid });

/**
 * Builds a codec for session declarations and their extra data.
 *
 * **Details**
 *
 * A main declaration uses the fixed {@link mainSessionId}.
 * A sub-session declaration references an earlier part by `uuid` in `fork`.
 * The codec does not check whether the referenced part exists or precedes the declaration.
 * Decoding a missing `extra` field produces an empty record.
 *
 * @see {@link parts} for constructing session declarations
 * @category schemas
 */
export const SessionPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Session", {
    type: Schema.Union([MainSession, SubSession]),
    extra: extraField(extrakit, "session"),
    uuid: Uuid,
  });

/**
 * A declaration of the main session or a sub-session.
 *
 * **Details**
 *
 * - A main declaration optionally supplies extra data for the main session.
 * - A sub-session's `fork` references an earlier prompt, response, or session declaration by `uuid`.
 * - Forking from a prompt or response includes the parent session's history through that part.
 * - Forking from a session declaration excludes that session's subsequent parts.
 * - Prompt, response, and event parts belong to the declared session through `sessionId`, not the declaration's `uuid`.
 *
 * Declare a sub-session before emitting its parts.
 * The declaration alone neither invokes a model nor starts a separate stream.
 *
 * @category models
 */
export type SessionPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof SessionPart<K>>
>;

/**
 * The encoded representation of a {@link SessionPart}.
 *
 * Decode with the matching {@link ExtraKit.Kit} to recover the extra data.
 * Validating one declaration does not validate the surrounding session history.
 *
 * @category models
 */
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

/**
 * Builds a codec for response parts and their extra data.
 *
 * **Details**
 *
 * With `stream: false`, the codec accepts non-streaming response parts.
 * With `stream: true`, it accepts both streaming and non-streaming response parts.
 * It does not combine streaming response parts into non-streaming response parts.
 * Tool calls and results use the supplied {@link Toolkit.Toolkit} schemas first, then fall back to `unknown`.
 * Encoding tries the toolkit schemas first to preserve their custom encoders.
 * Decoding a missing `extra` field produces an empty record.
 *
 * @see {@link parts} for constructing response parts without encoding them
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
 * One response part from a model call, with its session and extra data.
 *
 * **Details**
 *
 * One model call can produce multiple parts, including text, tool calls, and tool results.
 * `Stream: true` also permits streaming response parts, including text deltas.
 * Match `response.type` before reading fields specific to a response part.
 * An omitted `sessionId` places the part in the main session.
 *
 * @see {@link PromptPart} for the messages supplied to a model call
 * @category models
 */
export type ResponsePart<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
  Stream extends boolean,
> = Schema.Schema.Type<AllResponseParts<Toolkit, Extras, Stream>>;

/**
 * The encoded representation of a {@link ResponsePart}, including streaming and non-streaming response parts.
 *
 * Tool call parameters and tool results are typed as `unknown`.
 * Decode with a {@link ResponsePart} codec to apply the supplied {@link Toolkit.Toolkit} schemas.
 *
 * @category models
 */
export type ResponsePartEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponsePart<Toolkit.Any, ExtraKit.Any, true>>
>;

/**
 * Builds a codec for application events declared by an {@link EventKit.Kit}.
 *
 * Only declared event tags and their matching payload schemas are accepted.
 * An empty kit accepts no event payloads.
 *
 * @see {@link ResponsePart} for model output rather than application events
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
 * An event emitted by a program alongside prompt and response parts.
 *
 * **Details**
 *
 * The {@link EventKit.Kit} defines each event's meaning and payload.
 * An omitted `sessionId` places the event in the main session.
 * An event's `uuid` cannot be used as a sub-session's `fork`.
 *
 * @see {@link MetricPart} for metric outputs and producer failures attached to parts
 * @category models
 */
export type EventPart<K extends EventKit.Any> = Schema.Schema.Type<ReturnType<typeof EventPart<K>>>;

/**
 * The encoded representation of an {@link EventPart}.
 *
 * Decode with the matching {@link EventKit.Kit} to recover the payload.
 *
 * @category models
 */
export type EventPartEncoded = Schema.Codec.Encoded<ReturnType<typeof EventPart<EventKit.Any>>>;

/**
 * Builds a codec for metric outputs and producer failures declared by a {@link MetricKit.Kit}.
 *
 * Both {@link Metric.ProducerOutput} and {@link Metric.ProducerFailure} include `attach` references to parts by `uuid`.
 * An empty kit accepts no metric parts.
 *
 * @category schemas
 */
export const MetricPart = <K extends MetricKit.Any>(kit: K) =>
  Schema.TaggedStruct("Metric", {
    metric: Metric.MetricParts(kit),
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  });

/**
 * A metric output or producer failure attached to one or more parts.
 *
 * **Details**
 *
 * The metric tag identifies the metric declared by {@link MetricKit.Kit}.
 * The `metric.data` value is a {@link Metric.ProducerOutput} or {@link Metric.ProducerFailure}.
 * Its `attach` array references parts by `uuid`, rather than sessions by `sessionId`.
 * A producer failure stored in a metric part does not fail the trajectory stream.
 *
 * @see {@link EventPart} for events emitted by a program
 * @category models
 */
export type MetricPart<K extends MetricKit.Any> = Schema.Schema.Type<
  ReturnType<typeof MetricPart<K>>
>;

/**
 * The encoded representation of a {@link MetricPart}.
 *
 * Decode with the matching {@link MetricKit.Kit} to recover the metric output or producer failure.
 *
 * @category models
 */
export type MetricPartEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricPart<MetricKit.Any>>>;

/**
 * Constructors for trajectory parts using a {@link Config}.
 *
 * **Details**
 *
 * Constructors create parts without appending them to a trajectory or invoking a model.
 * Pass prompt, response, and session extra data in the options, keyed by extra tags.
 * The resulting part stores that data in `extra`.
 *
 * @see {@link parts} for creating constructors with UUID and timestamp defaults
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
 * Creates constructors for prompt, response, session, event, and metric parts.
 *
 * **When to use**
 *
 * Use when an integration already produces model input and output and needs to record them as trajectory parts.
 *
 * **Details**
 *
 * - Prompt, session, response, and event constructors generate an omitted `uuid`.
 * - Response and event constructors default an omitted `timestamp` to the current time.
 * - Prompt and metric timestamps remain absent unless supplied.
 * - Omitting `sessionId` leaves it absent; the part belongs to the main session.
 * - The `stream` setting selects accepted response parts; it does not combine streaming response parts.
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
    // SAFETY: the schema uses the same configuration as the return type.
    // TypeScript cannot resolve the conditional response type for a generic configuration.
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
 * The kits for trajectory parts and the flag permitting streaming response parts.
 *
 * **Details**
 *
 * - `toolkit` supplies schemas for tool calls and results through {@link Toolkit.Toolkit}.
 * - `eventkit` declares application events through {@link EventKit.Kit}.
 * - `metrickit` supplies schemas for metric outputs and producer failures through {@link MetricKit.Kit}.
 * - `extrakit` declares prompt, response, and session extra data through {@link ExtraKit.Kit}.
 * - `stream: true` permits both streaming and non-streaming response parts.
 * - `stream: false` permits only non-streaming response parts.
 *
 * The `stream` flag selects response parts; it does not control when the trajectory is consumed.
 *
 * @see {@link config} for defaults
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
 * A {@link Config} accepting either `stream` setting and any kits.
 *
 * Use a concrete {@link Config} to retain the types declared by its kits.
 *
 * @category models
 */
export type AnyConfig = Config<boolean, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A {@link Config} restricted to non-streaming response parts, with any kits.
 *
 * The trajectory remains a stream and may emit parts over time.
 *
 * @category models
 */
export type NonStreamConfig = Config<false, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * A {@link Config} with empty kits, permitting streaming and non-streaming response parts.
 *
 * Empty kits declare no events, metrics, or extra data.
 * Tool call parameters and tool results are typed as `unknown`.
 * Decoding event and metric parts requires kits declaring those events and metrics.
 *
 * @see {@link config} for supplying kits
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
 * The default configuration for decoding parts without caller-supplied kits.
 *
 * It permits streaming and non-streaming response parts and supplies empty kits.
 * Its {@link Config} annotation does not retain the precise empty-kit types.
 *
 * @see {@link config} for a configuration retaining the types of its kits
 * @category constants
 */
export const anyConfig: AnyConfig = {
  stream: true,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
};

/**
 * Creates a configuration with defaults for omitted kits and the `stream` flag.
 *
 * **Details**
 *
 * `stream` defaults to `true`, and omitted kits default to empty kits.
 * Use `stream: false` when consumers require non-streaming response parts.
 * Creating a configuration does not transform a stream or decode any parts.
 *
 * @see {@link anyConfig} for the default configuration without specific kit types
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
  // SAFETY: omitted fields use the defaults mirrored by the default type arguments.
  ({
    stream: config.stream ?? true,
    toolkit: config.toolkit ?? Toolkit.empty,
    eventkit: config.eventkit ?? EventKit.empty,
    metrickit: config.metrickit ?? MetricKit.empty,
    extrakit: config.extrakit ?? ExtraKit.empty,
  }) as Config<Stream, Toolkit, Events, Metrics, Extras>;

/**
 * A prompt, response, session, event, or metric part of a trajectory.
 *
 * Match `_tag` before reading fields specific to a part.
 * Parts follow stream order, not timestamp order.
 * Metric parts reference other parts through `attach` rather than through `sessionId`.
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
 * A stream of {@link Part} values, without requiring an attached {@link Config} or trajectory ID.
 *
 * **Details**
 *
 * Consumption can fail with `E` and requires services `R`.
 * Repeated consumption follows the source's behavior; this type provides no replay or caching guarantee.
 *
 * @see {@link Trajectory} for a stream carrying its configuration and ID
 * @category models
 */
export type TrajectoryStream<Config extends AnyConfig, E = never, R = never> = Stream.Stream<
  Part<Config>,
  E,
  R
>;

/**
 * A stream of {@link Part} values carrying a {@link Config} and a trajectory ID.
 *
 * **Details**
 *
 * - The value is an Effect {@link Stream.Stream}, not an array of parts.
 * - Consuming it pulls parts from its source, can fail with `E`, and requires services `R`.
 * - Its configuration supplies the kits for encoding and decoding parts and determines whether streaming response parts are permitted.
 * - `id` identifies the trajectory, not a storage key, session, or individual part.
 * - Constructing a trajectory with {@link make} does not consume its source or store its parts.
 * - Consuming it again can repeat source effects, including model calls.
 * - Stream transformations do not generally preserve the attached configuration and ID.
 *
 * **Example** (Consuming a prompt part)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect";
 * import * as Prompt from "@trajs/core/Prompt";
 * import * as Trajectory from "@trajs/core/Trajectory";
 *
 * const config = Trajectory.config();
 * const parts = Trajectory.parts(config);
 * const trajectory = Stream.make(
 *   parts.prompt(Prompt.make("Summarize this conversation.")),
 * ).pipe(Trajectory.make("conversation-1", config));
 *
 * const tags = await trajectory.pipe(
 *   Stream.map((part) => part._tag),
 *   Stream.runCollect,
 *   Effect.runPromise,
 * );
 *
 * tags; // => ["Prompt"]
 * ```
 *
 * @see {@link make} for attaching a configuration and ID to a stream
 * @see {@link cache} for consuming the source once and reading its parts repeatedly
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
 * Attaches a {@link Config} and a trajectory ID to a {@link TrajectoryStream}.
 *
 * **Details**
 *
 * The source remains lazy; this function neither consumes nor validates its parts.
 * The supplied configuration must match the source's parts, including their streaming response parts and kit declarations.
 * The configuration and `id` are assigned to the source stream object, not to a copy.
 * Omitting `id` generates a UUID when the returned function is applied to a stream.
 * Reusing the same stream object overwrites its attached configuration and ID.
 *
 * @see {@link parts} for constructing parts rather than trajectories
 * @see {@link cache} for retaining parts rather than only attaching a configuration and ID
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
 * The memory capacity of a trajectory cache.
 *
 * **Details**
 *
 * `capacity` counts the newest parts retained in memory, not bytes or readers.
 * It defaults to `"unbounded"`.
 * Older parts are written to the supplied {@link ByteStore} instead of being dropped.
 * Finite capacities are rounded down and clamped to zero.
 * A zero capacity writes every part to the byte store.
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
 * Caches a trajectory's parts so each consumer reads from the first part without consuming the source again.
 *
 * **When to use**
 *
 * Use when several consumers need the same parts without repeating model calls or other source effects.
 *
 * **Details**
 *
 * - Running the effect starts background consumption immediately, even without readers.
 * - Readers replay retained parts, then wait for new parts while the source is still running.
 * - Source failures reach readers after the previously retained parts.
 * - The returned trajectory retains the original configuration and ID.
 * - The enclosing scope owns background consumption and cached storage; keep it open while consuming the returned trajectory.
 * - Closing the scope interrupts background consumption and attempts to remove cached parts from the byte store.
 * - A {@link ByteStore} service is required even with unbounded in-memory retention.
 * - Writing and reading cached parts can introduce encoding, decoding, and byte-store failures.
 *
 * The supplied schemas must support decoding without services.
 * Encoding services and source services are supplied when the cache effect runs, not by each reader.
 * Cached parts are available within the scope, not saved for use after it closes.
 *
 * @see {@link CacheOptions} for memory capacity and byte-store use
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

  if (given !== undefined && Stream.isStream(given)) {
    return cached(given);
  }

  return (trajectory) => cached(trajectory, given);
}

/**
 * The {@link Config} of two merged trajectories.
 *
 * Kits combine their declarations, with right-hand definitions winning on duplicate names or tags.
 * The result permits streaming response parts if either input permits them.
 * Merging kits does not convert existing parts to the merged schemas.
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
 * Concatenates two trajectories and merges their kits.
 *
 * **Details**
 *
 * - All left-hand parts precede all right-hand parts; timestamps do not reorder them.
 * - The right source starts only after the left source completes successfully.
 * - A left-source failure prevents consumption of the right source.
 * - Omitting an explicit result ID generates a new UUID rather than retaining either input ID.
 * - Right-hand kit definitions win on duplicate names or tags.
 * - Part UUIDs, session IDs, and `fork` references remain unchanged.
 *
 * Both inputs must use compatible kit schemas and session IDs.
 * Parts with the same session ID belong to the same session in the result.
 * This function does not interleave the sources.
 *
 * @see {@link MergedConfig} for the merged configuration
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
  const stated = config({
    stream: left.stream || right.stream,
    toolkit: Toolkit.merge(left.toolkit, right.toolkit),
    eventkit: EventKit.merge(left.eventkit, right.eventkit),
    metrickit: MetricKit.merge(left.metrickit, right.metrickit),
    extrakit: ExtraKit.merge(left.extrakit, right.extrakit),
  });

  // SAFETY: compatible kit declarations let both inputs use the merged schemas.
  // Enabling streaming response parts also permits non-streaming response parts.
  return make(
    id,
    stated,
  )(Stream.concat(left, right) as TrajectoryStream<MergedConfig<Left, Right>, E | E2, R | R2>);
};
