/**
 * The parts a trajectory is made of, and the trajectory they arrive in.
 *
 * A trajectory is one stream of parts in total order — the prompts a model was
 * given, the responses it returned, the session each was produced in, and the events
 * and metrics a kit produced of them — with what those parts are read with and the id
 * it is named by.
 * {@link Trajectory} is that stream, {@link TrajectoryStream} one stating nothing of
 * itself, {@link Part} a part of a config, and {@link merge} reads two trajectories
 * as one. What the parts of it name is read apart from that order by
 * {@link Session.toSessions}: the sessions a trajectory holds, each with the parts it
 * produced and the ones it inherited ({@link Session.Session}). One stream is read once,
 * so a reading of a trajectory more than once — its sessions, or a second reader of it —
 * is a reading of parts kept for it: `Session.toSessions` keeps them for the sessions it
 * reads, and {@link share} so that the trajectory reads again.
 *
 * A part is read as a kit states it: a response part's response through its toolkit,
 * and the extra data of a prompt, response or session part through the extra kit
 * ({@link Extra.ExtraRecord}). Each part schema is therefore created for the kit it
 * is read with ({@link PromptPart}, {@link SessionPart}, {@link ResponsePart},
 * {@link EventPart}, {@link MetricPart}), and the parts of one trajectory are built
 * from its config ({@link parts}), so that a part states the kits its trajectory is
 * read with rather than naming them beside it.
 */

import { type ByteStore, type ByteStoreError } from "@trajs/utils/ByteStore";
import { DateTime, Effect, Schema, Scope, Stream } from "effect";

import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import type { EncodingServices, Readable } from "#/internal/parts.ts";
import { Timestamp, Uuid } from "#/internal/schema.ts";
import { shared } from "#/internal/share.ts";
import { attach, uuid } from "#/internal/trajectory.ts";
import type { Select } from "#/internal/types.ts";
import * as Metric from "#/Metric.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Toolkit from "#/Toolkit.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The extra data a part holds, read as the kit declares it of the part it is: a part a
 * trajectory states no extra data of holds none.
 */
const extraField = <K extends ExtraKit.Any, P extends Extra.Part>(extrakit: K, part: P) =>
  Extra.ExtraRecord(extrakit, part).pipe(Schema.withDecodingDefault(Effect.succeed({})));

/**
 * Creates the schema of a prompt part, as the extra kit given reads its extra data.
 *
 * **When to use**
 *
 * Use to read or write the prompt parts of a trajectory, or to build a schema of
 * your own over this one — one whose messages are carried as a file carries them,
 * say, as {@link Exchange.Part} does.
 *
 * **Details**
 *
 * - `messages` are the messages a model was given, as `effect/ai` states them, and
 *   `sessionId` the session the part was produced in.
 * - `uuid` identifies the part, and is what a {@link SessionPart}'s `fork` names;
 *   `.make` gives a part a fresh one.
 * - `timestamp` is when the part was produced, where what wrote it states a moment.
 *   A part that states none is read as a part of its own kind.
 * - `extra` is the extra data the kit declares of a prompt part, keyed by tag
 *   ({@link Extra.ExtraRecord}). A part produced stating none holds none, so a
 *   trajectory written before an extension declared its data still reads.
 *
 * @see {@link parts} for building the part under the config of its trajectory.
 * @see {@link Extra.ExtraRecord} for the extra data a part holds.
 * @category schemas
 */
export const PromptPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Prompt", {
    messages: Schema.Array(Prompt.Message),
    extra: extraField(extrakit, "prompt"),
    sessionId: Schema.String,
    uuid: Uuid,
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  });

/**
 * A prompt part as the kit given reads its extra data.
 *
 * @see {@link PromptPart} for the schema it is read by.
 * @category models
 */
export type PromptPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof PromptPart<K>>
>;

/**
 * A {@link PromptPart} as it is encoded: the messages as a trajectory states them,
 * and the extra data of every kind the kit declares of the part.
 *
 * @see {@link PromptPart} for the part itself.
 * @category models
 */
export type PromptPartEncoded = Schema.Codec.Encoded<ReturnType<typeof PromptPart<ExtraKit.Any>>>;

/**
 * The session a part built without one belongs to: `"root"`.
 *
 * **When to use**
 *
 * Use to name the session a part built by {@link parts} without one belongs to,
 * rather than repeating the id.
 *
 * @see {@link parts} for the builders that state it as the default.
 * @category constants
 */
export const rootSession = "root";

/**
 * Creates the schema of a session part, as the extra kit given reads its extra
 * data.
 *
 * **When to use**
 *
 * Use to read or write the session declarations of a trajectory, or to build a
 * schema of your own over this one.
 *
 * **Details**
 *
 * - `id` names the session the parts after the declaration are produced in, and
 *   `uuid` identifies the declaration.
 * - `fork` names the part a session continues from, where it continues from another:
 *   it is the `uuid` of a part of the forked-from session rather than that session's
 *   id, so a fork relates two parts ({@link Session.Fork}). A session is declared before the
 *   parts it produces, so a fork names a part the trajectory already reached — see
 *   {@link TrajectoryError.SessionError} for what reading one fails with where it has
 *   not.
 * - `extra` is the extra data the kit declares of a session part
 *   ({@link Extra.ExtraRecord}).
 *
 * @see {@link parts} for building a part under the config of its trajectory.
 * @see {@link Session.toSessions} for reading a trajectory as its sessions.
 * @category schemas
 */
export const SessionPart = <K extends ExtraKit.Any>(extrakit: K) =>
  Schema.TaggedStruct("Session", {
    id: Schema.String,
    fork: Schema.optional(Uuid),
    extra: extraField(extrakit, "session"),
    uuid: Uuid,
  });

/**
 * A session part as the kit given reads its extra data.
 *
 * @see {@link SessionPart} for the schema it is read by.
 * @category models
 */
export type SessionPart<K extends ExtraKit.Any> = Schema.Schema.Type<
  ReturnType<typeof SessionPart<K>>
>;

/**
 * A {@link SessionPart} as it is encoded: the id of the session and the part it
 * forks from as a trajectory states them, and the extra data of the part.
 *
 * @see {@link SessionPart} for the part itself.
 * @category models
 */
export type SessionPartEncoded = Schema.Codec.Encoded<ReturnType<typeof SessionPart<ExtraKit.Any>>>;

const responseFields = {
  timestamp: Timestamp,
  sessionId: Schema.String,
  uuid: Uuid,
};

/** The response part schema that reads the whole parts a model returned. */
const NonStreamResponsePart = <T extends Toolkit.Any, K extends ExtraKit.Any>(
  toolkit: T,
  extrakit: K,
) =>
  Schema.TaggedStruct("Response", {
    response: Response.PartView(toolkit),
    extra: extraField(extrakit, "response"),
    ...responseFields,
  });

/** The response part schema that reads every part a response may hold. */
const StreamResponsePart = <T extends Toolkit.Any, K extends ExtraKit.Any>(
  toolkit: T,
  extrakit: K,
) =>
  Schema.TaggedStruct("Response", {
    response: Response.AllPartsView(toolkit),
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
 * Creates the schema of a response part, in the variant the config given asks for.
 *
 * **When to use**
 *
 * Use to read or write the response parts of a trajectory.
 *
 * **Details**
 *
 * - `stream` says what the `response` of a part is: `true` reads every part a
 *   response may hold — the increments a streamed response arrived in and the whole
 *   parts they complete — and `false` the whole parts alone. A trajectory is read as
 *   the most general trajectory, so a folded part is a member of the streaming
 *   schema too — see {@link Exchange.Part}.
 * - `toolkit` is what the response is read by: the tool call and tool result parts of
 *   its tools as those tools state them, and a part naming a tool the toolkit no
 *   longer holds as the part it was produced as — see {@link Response.AllPartsView}.
 * - `extrakit` reads the part's extra data ({@link Extra.ExtraRecord}); `timestamp`,
 *   `sessionId` and `uuid` are the fields every response part is produced with.
 *
 * The response is read through the toolkit, so encoding one takes what those tools
 * state — see {@link Exchange.EncodingServices}.
 *
 * **Example** (Writing a response as the increments a model returned it in)
 *
 * ```ts import.meta.vitest
 * import { ExtraKit, Response, Toolkit, Trajectory } from "@trajs/core"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const schema = Trajectory.ResponsePart({
 *   toolkit: Toolkit.empty,
 *   extrakit: ExtraKit.empty,
 *   stream: true
 * })
 *
 * const part = schema.make({
 *   response: Response.makePart("text-start", { id: "text_1" }),
 *   sessionId,
 *   extra: {}
 * })
 *
 * part.response.type // => "text-start"
 * ```
 *
 * @see {@link parts} for building a part under the config of its trajectory.
 * @see {@link ResponsePartEncoded} for the encoded form of a part.
 * @see {@link Response.AllPartsView} for what the response of a part is read as.
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
  // SAFETY: `AllResponseParts` selects the codec pair by `Stream`, so the branch
  // taken is the pair the return type names.
  (stream
    ? StreamResponsePart(toolkit, extrakit)
    : NonStreamResponsePart(toolkit, extrakit)) as AllResponseParts<Toolkit, Extras, Stream>;

/**
 * A response part as the toolkit and the extra kit given read it, in the variant
 * asked for.
 *
 * @see {@link ResponsePart} for the schema it is read by.
 * @category models
 */
export type ResponsePart<
  Toolkit extends Toolkit.Any,
  Extras extends ExtraKit.Any,
  Stream extends boolean,
> = Schema.Schema.Type<AllResponseParts<Toolkit, Extras, Stream>>;

/**
 * A {@link ResponsePart} as it is encoded, in the variant a trajectory states.
 *
 * **When to use**
 *
 * Use to type what a trajectory holds of a response part, such as to carry one in a
 * format of your own.
 *
 * **Details**
 *
 * A trajectory is read as the most general trajectory, whose response parts are the
 * streams they arrived in, so the encoded part is the streaming variant; the folded
 * response parts of another kind are members of it too, as {@link ResponsePart} says.
 *
 * @see {@link ResponsePart} for the part itself.
 * @see {@link Exchange.Part} for the parts a trajectory carries.
 * @category models
 */
export type ResponsePartEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponsePart<Toolkit.Any, ExtraKit.Any, true>>
>;

/**
 * Creates the schema of an event part, as the event kit given reads the event it
 * names.
 *
 * **When to use**
 *
 * Use to read or write the events of a trajectory — what a run produced of itself
 * rather than what was said — or to build a schema of your own over this one.
 *
 * **Details**
 *
 * - `event` is the event of the kit the part names, read as {@link Event.EventParts}
 *   reads one — by the schema of that event at the version the part was written at —
 *   so a part naming an event the kit does not name is not read at all.
 * - `timestamp` is when the event was produced, which `.make` supplies as the time
 *   the part is built; `sessionId` and `uuid` say where it was produced and which
 *   part it is.
 *
 * An event part holds no extra data: what an extension declares of a part is an
 * {@link Extra}, declared of the parts in {@link Extra.Part}.
 *
 * @see {@link Event.EventParts} for the events a part is read as.
 * @see {@link Extra.Part} for the parts extra data is declared of.
 * @category schemas
 */
export const EventPart = <K extends EventKit.Any>(kit: K) =>
  Schema.TaggedStruct("Event", {
    event: Event.EventParts(kit),
    timestamp: Timestamp,
    sessionId: Schema.String,
    uuid: Uuid,
  });

/**
 * An event part as the kit given reads the event it names.
 *
 * @see {@link EventPart} for the schema it is read by.
 * @category models
 */
export type EventPart<K extends EventKit.Any> = Schema.Schema.Type<ReturnType<typeof EventPart<K>>>;

/**
 * An {@link EventPart} as it is encoded: the tag of the event it names and the data
 * of that event as a trajectory states them.
 *
 * @see {@link EventPart} for the part itself.
 * @category models
 */
export type EventPartEncoded = Schema.Codec.Encoded<ReturnType<typeof EventPart<EventKit.Any>>>;

/**
 * Creates the schema of a metric part, as the metric kit given reads what the metric
 * derived.
 *
 * **When to use**
 *
 * Use to read or write what a kit derived of a trajectory, so that what a trajectory
 * is worth reads back without the producers that derived it.
 *
 * **Details**
 *
 * - `metric` is the report of one metric of the kit, keyed by that metric's tag and
 *   read as {@link Metric.MetricParts} reads one: the output a producer yielded, or
 *   the failure it reported.
 * - `timestamp` is when the metric was derived, where stated at all.
 *
 * A metric part holds no extra data, as an event part does not.
 *
 * @see {@link Metric.MetricParts} for what a part is read as.
 * @see {@link Metric.produce} for deriving the parts of a kit from a trajectory.
 * @category schemas
 */
export const MetricPart = <K extends MetricKit.Any>(kit: K) =>
  Schema.TaggedStruct("Metric", {
    metric: Metric.MetricParts(kit),
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  });

/**
 * A metric part as the kit given reads what the metric derived.
 *
 * @see {@link MetricPart} for the schema it is read by.
 * @category models
 */
export type MetricPart<K extends MetricKit.Any> = Schema.Schema.Type<
  ReturnType<typeof MetricPart<K>>
>;

/**
 * A {@link MetricPart} as it is encoded: the tag of the metric it reports and the
 * output or failure that metric derived, as a trajectory states them.
 *
 * @see {@link MetricPart} for the part itself.
 * @category models
 */
export type MetricPartEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricPart<MetricKit.Any>>>;

/**
 * The parts a trajectory of the config given is built with: one builder per kind of
 * part, each stating the config's own kits.
 *
 * **When to use**
 *
 * Use to build the parts of one trajectory — what a model was given and returned, the
 * session they were produced in, and what a kit contributed of it — so that every part
 * is stated for the trajectory it is written into rather than for kits named beside
 * it.
 *
 * **Details**
 *
 * - `prompt`, `session` and `response` state the extra data the config's extra kit
 *   declares of the kind of part they build ({@link Extra.ExtraRecord}); a part built
 *   stating none of it holds none.
 * - `response` builds the variant the config states: the increments a streamed answer
 *   arrives in where `stream` is on, and the whole parts a model returned where it is
 *   off — see {@link ResponsePart}.
 * - `event` builds an event of the config's event kit in the session given, and
 *   `metric` a report of its metric kit ({@link EventPart}, {@link MetricPart}).
 * - A prompt or response part is timed where it is built, and a caller that knows when
 *   it happened states it as the part's `timestamp` rather than leaving the part to be
 *   timed as it is built.
 * - A part is given a fresh `uuid` where none is stated: the identity of a part is what a
 *   `fork` names, so a caller that replays a part states the one it had
 *   ({@link Session.Fork}).
 * - The schema each builder builds from is the module's own ({@link PromptPart},
 *   {@link SessionPart}, {@link ResponsePart}, {@link EventPart}, {@link MetricPart}),
 *   which takes the one kit it reads; a builder takes the config, which is what the
 *   parts of a trajectory are stated with.
 *
 * @see {@link parts} for building one.
 * @see {@link Config} for what the parts are read with.
 * @category models
 */
export interface Parts<Config extends AnyConfig> {
  /**
   * The prompt part of what a model was given: the messages of the prompt asked, in the
   * session given — {@link rootSession} where none is.
   */
  readonly prompt: (
    prompt: Prompt.Prompt,
    options?: {
      readonly sessionId?: string;
      readonly extra?: Extra.ExtraRecord<Config["extrakit"]["extra"], "prompt">;
      readonly timestamp?: DateTime.Utc;
      readonly uuid?: string;
    },
  ) => PromptPart<Config["extrakit"]>;

  /**
   * The declaration of a session the trajectory produces in, and of the part it
   * continues from where `fork` names one: the `uuid` of a part of the session forked
   * from rather than that session's id — see {@link Session.Fork}.
   */
  readonly session: (
    id: string,
    options?: {
      readonly fork?: string;
      readonly extra?: Extra.ExtraRecord<Config["extrakit"]["extra"], "session">;
      readonly uuid?: string;
    },
  ) => SessionPart<Config["extrakit"]>;

  /**
   * One part of what a model returned, in the session given — {@link rootSession} where
   * none is — and in the variant the config states.
   */
  readonly response: (
    response: ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>["response"],
    options?: {
      readonly sessionId?: string;
      readonly extra?: Extra.ExtraRecord<Config["extrakit"]["extra"], "response">;
      readonly timestamp?: DateTime.Utc;
      readonly uuid?: string;
    },
  ) => ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>;

  /**
   * An event of the config's event kit, produced in the session given —
   * {@link rootSession} where none is.
   */
  readonly event: (
    event: Event.EventParts<Config["eventkit"]["events"]>,
    options?: {
      readonly sessionId?: string;
      readonly timestamp?: DateTime.Utc;
      readonly uuid?: string;
    },
  ) => EventPart<Config["eventkit"]>;

  /** A report of one metric of the config's metric kit. */
  readonly metric: (
    metric: Metric.MetricParts<Config["metrickit"]["metrics"]>,
    options?: { readonly timestamp?: DateTime.Utc },
  ) => MetricPart<Config["metrickit"]>;
}

/**
 * Builds the parts of a trajectory of the config given.
 *
 * **When to use**
 *
 * Use where the parts of a trajectory are written in a program — a fixture, a codec
 * that reads another format, or a run that writes its own parts — so that each part is
 * stated for the config its trajectory is read with, rather than for kits named beside
 * it.
 *
 * **Details**
 *
 * - The config is read once, when the builders are made: whether a response part is
 *   built as an increment of a streamed answer or as a whole part is the config's
 *   `stream`, and the extra data a part may state is its extra kit's — so no builder
 *   can state a kit the trajectory is not read with.
 * - A part built with no session belongs to {@link rootSession}, and one built with no
 *   `timestamp` is timed as it is built; both may still be stated.
 * - The parts a caller replays are written as the parts they were: a `uuid` stated is the
 *   identity the part is written with, so a trajectory written twice from stated
 *   identities — the parts of a fixture, say — is the same bytes ({@link Parts}).
 * - Building a part validates it against the schema of its kind: an extra datum the kit
 *   does not declare of that kind of part, or a response the toolkit does not state, is
 *   refused where the part is built.
 *
 * **Example** (Writing the parts of one trajectory)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { EventKit, Extra, ExtraKit, MetricKit, Prompt, Response, Toolkit, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const estimate = new Extra.Extra({
 *   package: "tokenize",
 *   id: "estimate",
 *   prompt: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const config = Trajectory.config({
 *   stream: false,
 *   toolkit: Toolkit.empty,
 *   eventkit: EventKit.empty,
 *   metrickit: MetricKit.empty,
 *   extrakit: ExtraKit.make(estimate)
 * })
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const parts = Trajectory.parts(config)
 *
 * // What the model was asked, with what the extra kit declares of a prompt part, and
 * // what it answered: the config says a response part is whole, so it is.
 * const asked = parts.prompt(Prompt.make("What is 2 + 2?"), {
 *   sessionId,
 *   extra: { "tokenize/estimate": { version: "0.1.0", tokens: 7 } }
 * })
 * const answered = parts.response(Response.makePart("text", { text: "4" }), { sessionId })
 *
 * asked.extra["tokenize/estimate"]?.tokens // => 7
 * answered.response.type // => "text"
 * ```
 *
 * @see {@link Parts} for what it builds with.
 * @see {@link Trajectory} for the parts it builds.
 * @see {@link Config} for what they are read with.
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
    prompt: (asked, { sessionId = rootSession, extra = {}, timestamp, uuid } = {}) =>
      prompt.make({ messages: asked.content, sessionId, extra, timestamp, uuid }),
    session: (id, { fork, extra = {}, uuid } = {}) => session.make({ id, fork, extra, uuid }),
    // SAFETY: the schema was made for the variant the config states, and what it makes
    // is the part the fields given state; TypeScript leaves that selection unevaluated
    // where the config is a type parameter and reads the part it makes as the streaming
    // one alone.
    response: (answered, { sessionId = rootSession, extra = {}, timestamp, uuid } = {}) =>
      response.make({ response: answered, sessionId, extra, timestamp, uuid }) as ResponsePart<
        Config["toolkit"],
        Config["extrakit"],
        Config["stream"]
      >,
    event: (given, { sessionId = rootSession, timestamp, uuid } = {}) =>
      event.make({ event: given, sessionId, timestamp, uuid }),
    metric: (given, { timestamp } = {}) => metric.make({ metric: given, timestamp }),
  };
};

/**
 * What a trajectory is read with: the variant its response parts are in, and the
 * kits that say how its parts read.
 *
 * **When to use**
 *
 * Use to name what a trajectory is read with — a field of one, or the parameter of
 * a function that reads one.
 *
 * **Details**
 *
 * - `stream` says what a response part is: `true` reads one as every part a response
 *   may hold, and `false` as the whole parts alone — see {@link ResponsePart}.
 * - `toolkit` is what the responses were returned by, `eventkit` the events a
 *   trajectory may name ({@link EventKit.Kit}), `metrickit` the metrics derived of it
 *   ({@link MetricKit.Kit}), and `extrakit` the extra data of its prompt, response
 *   and session parts ({@link ExtraKit.Kit}).
 *
 * Every type parameter defaults to `never`, so a config names what it holds; the
 * config of a trajectory read without knowing its kits is {@link AnyConfig}.
 *
 * @see {@link AnyConfig} for the config that holds anything.
 * @see {@link config} for stating one.
 * @see {@link Part} for the parts a config reads.
 * @see {@link EventKit.Kit} for the events a config names.
 * @see {@link MetricKit.Kit} for the metrics a config names.
 * @see {@link ExtraKit.Kit} for the extra data a config names.
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
 * The config of a trajectory read without knowing what it holds: response parts of
 * either variant, and kits that name anything.
 *
 * **When to use**
 *
 * Use to type a reading that does not know the kits a trajectory was written with —
 * one that measures, displays or migrates a trajectory rather than acting on what it
 * holds.
 *
 * @see {@link Config} for a config that names what a trajectory holds.
 * @category models
 */
export type AnyConfig = Config<boolean, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * The config of a reading whose response parts are the whole parts a model
 * returned.
 *
 * **When to use**
 *
 * Use to type a reading that measures a trajectory rather than acting on what it
 * holds, since what a measurement is of is the parts a model was given and
 * returned rather than the increments an answer arrived in.
 *
 * **Details**
 *
 * It is {@link AnyConfig} with `stream` off, so the increments a streamed answer
 * arrived in are not members of its response parts. An answer that arrived in
 * increments is folded into the whole parts they complete before such a reading sees
 * it — by {@link Metric.produce}, and by a {@link Exchange.Loaded.read} given a config
 * of this kind.
 *
 * @see {@link AnyConfig} for the config that holds anything.
 * @category models
 */
export type NonStreamConfig = Config<false, Toolkit.Any, EventKit.Any, MetricKit.Any, ExtraKit.Any>;

/**
 * The config of a reading that names no kits: it holds no tool, event, metric or
 * extra datum, and its response parts are read as streams.
 *
 * **When to use**
 *
 * Use to type a trajectory a program reads or writes in a format's own terms rather
 * than in the terms of a kit.
 *
 * @see {@link AnyConfig} for the config of a reading that does not know the kits.
 * @see {@link Config} for a config that names what a trajectory holds.
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
 * The config a trajectory is read with: {@link AnyConfig} as the value of a
 * trajectory that states nothing about itself.
 *
 * **When to use**
 *
 * Use to read a trajectory as the part it is rather than as what its kits state, or to
 * name the reading of a trajectory that states no kit of its own.
 *
 * **Details**
 *
 * Every kit is empty and response parts are read as streams, so a part is read as far
 * as a reading of no kit reads the bytes it holds. The parts a model returned are
 * stated apart from the tools they called, so a response part reads whether or not
 * the toolkit holds the tool it names; a metric or event part of a kind the reading
 * does not name is not a part it reads, and the extra data of a part is stated by the
 * kit that declares it, so a reading that names none holds none either.
 *
 * A trajectory is read as a streaming trajectory whatever it was written as, since
 * the increments of a streamed response and the whole parts they complete are members
 * of the streaming schema: one reading carries the response parts of either kind.
 *
 * @see {@link AnyConfig} for the type this is the value of.
 * @see {@link config} for the config a trajectory of its own kits is read with.
 * @see {@link Config} for what a config names.
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
 * States what a trajectory is read with: the kits its parts are read by and the variant
 * they are in, as one config.
 *
 * **When to use**
 *
 * Use to state the kits a trajectory is read with once, rather than as a record written
 * out at each place a part is built of it, a trajectory is made of it, or bytes are read
 * with it.
 *
 * **Details**
 *
 * - What it takes is a {@link Config} whose every field is optional — a record, or nothing
 *   at all — and what it returns is the {@link Config} itself, so it is what every function
 *   taking a config takes: every field it returns is stated, and a field the record leaves
 *   out is returned as the default of that field — an empty kit of its kind
 *   (`Toolkit.empty`, `EventKit.empty`, `MetricKit.empty`, `ExtraKit.empty`), and a variant
 *   of `true`. So a reading that names one kit states the others by naming none, and a
 *   reading that names nothing is {@link UnknownConfig}.
 * - `stream` is read as the literal it is stated as, so a config stating `false` is one
 *   whose response parts are whole alone, without `as const` — see {@link Config}. It
 *   defaults to `true`, which reads a response part as every part a response may hold —
 *   the increments an answer arrived in and the whole parts they complete — so a reading
 *   that states nothing of the variant carries either.
 * - It is a statement rather than a check: a kit that does not read the parts a
 *   trajectory holds is refused where a part or a trajectory is built of it
 *   ({@link Part}, {@link PromptPart}), rather than here.
 *
 * **Example** (Stating what a trajectory is read with)
 *
 * ```ts import.meta.vitest
 * import { EventKit, Trajectory } from "@trajs/core"
 *
 * // A reading that states nothing: no kit of its own, and a response part read as the
 * // parts a response may hold.
 * const any = Trajectory.config()
 *
 * any.stream // => true
 * any.eventkit === EventKit.empty // => true
 *
 * // A reading that states the variant alone: the whole parts a model returned, and no kit.
 * Trajectory.config({ stream: false }).stream // => false
 * ```
 *
 * @see {@link Config} for what the record states.
 * @see {@link UnknownConfig} for what a call that states nothing is.
 * @see {@link Trajectory} for the trajectory it reads.
 * @see {@link anyConfig} for the config that names no kit.
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
  // SAFETY: each field not stated is the default of its type parameter — the empty kit of
  // its kind, and `true` for the variant — so what is returned states every field of the
  // config the signature names.
  ({
    stream: config.stream ?? true,
    toolkit: config.toolkit ?? Toolkit.empty,
    eventkit: config.eventkit ?? EventKit.empty,
    metrickit: config.metrickit ?? MetricKit.empty,
    extrakit: config.extrakit ?? ExtraKit.empty,
  }) as Config<Stream, Toolkit, Events, Metrics, Extras>;

/**
 * A part of a trajectory of the config given.
 *
 * **When to use**
 *
 * Use to type a stream of parts, or to tell the parts of a trajectory apart by the
 * tag each carries.
 *
 * **Details**
 *
 * - A prompt, session or response part is read with the config's extra kit: its
 *   `extra` is the extra data that kit declares of the part it is — see
 *   {@link Extra.ExtraRecord}.
 * - A response part's response is read with the config's toolkit, and is the whole
 *   parts a model returned or every part it arrived in, as the config's `stream`
 *   says.
 * - An event part is read with the config's event kit, and a metric part with its
 *   metric kit. Neither holds extra data, since extra data is declared of the three
 *   kinds of part alone — see {@link Extra.Part}.
 *
 * A part is tagged, so a reader branches on its tag rather than on the fields it
 * happens to hold — see {@link View.promptTurns} for a reading of a trajectory by
 * the tags of its parts.
 *
 * @see {@link Trajectory} for the stream the parts of a trajectory arrive in.
 * @category models
 */
export type Part<Config extends AnyConfig> =
  | PromptPart<Config["extrakit"]>
  | SessionPart<Config["extrakit"]>
  | ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>
  | EventPart<Config["eventkit"]>
  | MetricPart<Config["metrickit"]>;

/**
 * A stream of the parts of a trajectory, stating nothing of itself.
 *
 * **When to use**
 *
 * Use to type what a reader of parts takes, so that a caller may hand it a
 * {@link Trajectory} or a stream that never carried a config.
 *
 * **Details**
 *
 * A stream of parts is read under the config its type names alone, so what a reader
 * can do with one part is what that config states of it: read as {@link AnyConfig},
 * the parts are as loose as any config reads them, and read as a config of a
 * toolkit, the tools of that toolkit are what its responses are typed by.
 *
 * @see {@link Trajectory} for a stream of parts that carries what it is read with.
 * @category models
 */
export type TrajectoryStream<Config extends AnyConfig, E = never, R = never> = Stream.Stream<
  Part<Config>,
  E,
  R
>;

/**
 * A trajectory: the parts of a trajectory as one stream, the id it is named by, and what
 * they are read with.
 *
 * **When to use**
 *
 * Use to read a trajectory that was decoded, or to write one: a trajectory is what
 * an {@link Exchange.Service} reads a trajectory as, and what it writes one from.
 *
 * **Details**
 *
 * - `id` is the id the trajectory is named by. It is stated where the trajectory is made
 *   ({@link make}, {@link merge}, and the constructors of `Produce`), and a trajectory
 *   none is stated for is named by a new uuid — one read out of a storage included, since
 *   the bytes of a trajectory state no id of their own. `Id` is the type of that id,
 *   `string` for a trajectory made without a name of its own.
 * - The `stream`, `toolkit`, `eventkit`, `metrickit` and `extrakit` a trajectory is
 *   read with are the {@link Config} its parts are read with, and it carries that
 *   config rather than stating it beside the parts: a function handed a trajectory has
 *   the kits its parts were read by, and reads the extra data of a part without the
 *   caller naming them again. The parts are read as they arrive rather than held whole,
 *   so what a trajectory holds is read once, while the config and the id are readable
 *   without reading any of it.
 *
 * @see {@link TrajectoryStream} for the parts of a trajectory alone.
 * @see {@link Exchange.Service.read} for reading a trajectory as one.
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
 * Makes a trajectory of the parts a stream gives, named by an id and carrying what they
 * are read with.
 *
 * **When to use**
 *
 * Use when the parts of a trajectory are written in a program rather than read from
 * an exchange — a fixture, a test, or the parts a codec of another format decoded —
 * and they are to read as a trajectory rather than as the parts they hold.
 *
 * **Details**
 *
 * - The trajectory's own terms are bound first and what it is made of lies in what is
 *   left, as every constructor of this module states them: `make(id, config)` and
 *   `make(config)` both return the function of the stream that a stream of parts is piped
 *   into.
 * - A trajectory made without an id is named by a new uuid, generated where the stream is
 *   bound ({@link Trajectory}); given an id it is named by that one, so a fixture is named
 *   by what it is of rather than by a name of its own.
 * - What a part reads as is the config's, so the parts a stream gives are judged
 *   against the config given ({@link Part}).
 * - The stream is not read here: it is the trajectory's parts as given, with the
 *   config stated on it rather than read off it, so a trajectory made this way is
 *   read as often as it is subscribed to.
 * - It is the other direction of what an {@link Exchange.Service} does: a trajectory
 *   read from bytes carries the config it was decoded with, and one assembled in a
 *   program carries the config it is to be written with.
 *
 * **Example** (Reading parts written in a program as a trajectory)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { EventKit, ExtraKit, MetricKit, Prompt, Toolkit, Trajectory } from "@trajs/core"
 *
 * const extrakit = ExtraKit.empty
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 *
 * // What the parts are read with: the config says how a part reads, so it is stated
 * // beside the parts rather than on each of them.
 * const config = Trajectory.config({
 *   stream: true,
 *   toolkit: Toolkit.empty,
 *   eventkit: EventKit.empty,
 *   metrickit: MetricKit.empty,
 *   extrakit
 * })
 *
 * const stream = Stream.make(
 *   Trajectory.parts(config).prompt(Prompt.make("What is 2 + 2?"), { sessionId })
 * )
 *
 * // The config bound alone is a function of the stream, which is what a stream of
 * // parts is piped into — and a name bound before it is the id the trajectory carries.
 * const unnamed = Trajectory.make(config)(stream)
 * const named = stream.pipe(Trajectory.make("01890a5d-ac96-774b-bcce-b302099a8057", config))
 *
 * const read = Array.from(await Effect.runPromise(Stream.runCollect(named)))
 * read.map((part) => part._tag) // => ["Prompt"]
 * named.id // => "01890a5d-ac96-774b-bcce-b302099a8057"
 * named.stream // => true
 * named.extrakit === extrakit // => true
 * unnamed.id.length // => 36
 * ```
 *
 * @see {@link Trajectory} for what a trajectory is, the id among it.
 * @see {@link Config} for what it is read with.
 * @see {@link Exchange.Service.save} for writing the trajectory made.
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
 * What a trajectory reads as one that reads again with: how many of its newest parts are kept
 * in memory.
 *
 * **When to use**
 *
 * Use to type what {@link share} is given, or to state how long a trajectory is held in memory
 * where more than one reader reads it.
 *
 * **Details**
 *
 * - `capacity` is how many of the newest parts are kept in memory, and defaults to
 *   `"unbounded"`: every part of the trajectory. The parts a window of that size cannot hold
 *   are kept as the frames a trajectory is carried in, in the store of bytes the reading is
 *   provided with ({@link ByteStore}), so a trajectory read this way is held whole whatever its
 *   length while only its newest parts are in memory.
 *
 * @see {@link share} for the reading it is given to.
 * @category models
 */
export interface ShareOptions {
  readonly capacity?: number | "unbounded" | undefined;
}

/**
 * What sharing a trajectory is: the trajectory read again, once the parts it is read from are
 * kept.
 */
type Shared<Id extends string, Config extends AnyConfig, E, R> = Effect.Effect<
  Trajectory<Id, Config, E | TrajectoryError | ByteStoreError, never>,
  E | TrajectoryError | ByteStoreError,
  Scope.Scope | R | EncodingServices<Config> | ByteStore
>;

/**
 * Reads a trajectory as one that reads again: its parts kept from one reading of it, so that
 * every reader reads it from its first part, whatever moment it starts at.
 *
 * **When to use**
 *
 * Use when the parts of a trajectory are read more than once — two views of one run, a reader
 * that starts after the trajectory has been read, an analysis that reads it after its sessions
 * were — so that every one of them reads the whole trajectory rather than the parts that
 * happen to arrive while it is reading.
 *
 * **Details**
 *
 * - The trajectory is read once, as soon as it is shared, and every part is kept as it arrives:
 *   what a reader reads is the parts the trajectory produced, in the order it produced them, and
 *   a reader that starts after the trajectory ended reads it whole all the same. That is where
 *   this differs from `Stream.share`, whose later subscribers read only the parts replayed to
 *   them: no reader misses a part here, whenever it subscribes.
 * - `capacity` states how many of the newest parts are kept in memory, and defaults to every one
 *   of them ({@link ShareOptions}). The parts a window of that size cannot hold are kept in the
 *   store of bytes the reading is provided with ({@link ByteStore}), under keys of its own, as
 *   the frames a trajectory is carried in ({@link Exchange.Part}) — and read back as a reader
 *   asks for them — so a trajectory longer than its window is held by that store rather than in
 *   memory.
 * - What the trajectory is shared with is stated before the trajectory where it is stated alone,
 *   as every constructor of this module binds its own terms first: `share(options)(trajectory)`
 *   is the same call as `share(trajectory, options)`.
 * - Each reader reads a stream of its own: one that stops early, or is interrupted, disturbs
 *   none of the others, and the shared trajectory reads as often as it is asked for. What is
 *   kept lives as long as the scope the trajectory was shared in, so that scope must outlive
 *   the readings of it: the source is not read further once it closes, and the parts kept in the
 *   store are removed with it.
 * - The trajectory it returns is named by the same id and read with the same config as the one
 *   given, since it is that trajectory read again rather than another one.
 *
 * It fails with what the trajectory it reads fails with, as the failure of every reader that
 * reaches it — the parts produced before a failure are read, and the failure is reported after
 * them — and with the failure of keeping a part ({@link TrajectoryError}, {@link ByteStoreError}).
 * Keeping a part beyond the window writes it as the bytes a part is carried in, so the services
 * writing one takes are required here as well ({@link EncodingServices}), and so is the store it
 * is written into ({@link ByteStore}).
 *
 * **Example** (Reading one trajectory twice)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { ByteStore, Prompt, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 *
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.session(sessionId),
 *     part.prompt(Prompt.make("What is 2 + 2?"), { sessionId })
 *   )
 * )
 *
 * const tags = await Effect.runPromise(
 *   Effect.scoped(
 *     Effect.gen(function*() {
 *       const shared = yield* Trajectory.share(trajectory)
 *
 *       // A reader reads the trajectory from its first part ...
 *       const first = yield* Stream.runCollect(shared)
 *       // ... and one that starts once it has ended reads it whole as well.
 *       const second = yield* Stream.runCollect(shared)
 *
 *       return [first, second].map((read) => read.map((part) => part._tag))
 *     })
 *   ).pipe(Effect.provide(ByteStore.layer()))
 * )
 *
 * tags // => [["Session", "Prompt"], ["Session", "Prompt"]]
 * ```
 *
 * @see {@link ShareOptions} for what it is given.
 * @see {@link Session.toSessions} for reading a trajectory as the sessions it names, which
 * keeps its parts for that reading alone.
 * @see {@link ByteStore} for the store the parts beyond the window are kept in.
 * @category constructors
 */
export function share<Id extends string, Config extends AnyConfig, E, R>(
  trajectory: Trajectory<Id, Config, E, R> & Readable<Config>,
  options?: ShareOptions,
): Shared<Id, Config, E, R>;
export function share(
  options?: ShareOptions,
): <Id extends string, Config extends AnyConfig, E, R>(
  trajectory: Trajectory<Id, Config, E, R> & Readable<Config>,
) => Shared<Id, Config, E, R>;
export function share<Config extends AnyConfig, E, R>(
  ...args:
    | [
        trajectory: Trajectory<string, Config, E, R> & Readable<Config>,
        options?: ShareOptions | undefined,
      ]
    | [options?: ShareOptions | undefined]
):
  | Shared<string, Config, E, R>
  | ((
      trajectory: Trajectory<string, Config, E, R> & Readable<Config>,
    ) => Shared<string, Config, E, R>) {
  if (args.length === 2) {
    const [trajectory, options] = args;

    return shared(trajectory, options);
  }

  const [given] = args;

  // What a trajectory is shared with is a record, and a trajectory is a stream: a call stating
  // one of them alone states either the trajectory it shares or the options it shares it with.
  if (given !== undefined && Stream.isStream(given)) {
    return shared(given);
  }

  return (trajectory) => shared(trajectory, given);
}

/**
 * The config of the trajectory two trajectories merge into: the response parts of
 * either variant, and the kits of both.
 *
 * **When to use**
 *
 * Use to name what {@link merge} returns, such as to type a function that reads two
 * trajectories as one.
 *
 * **Details**
 *
 * - `stream` is `true` where either of the two streams, since the response parts of
 *   a merged trajectory are those of both kinds: the increments a streamed answer
 *   arrived in, and the whole parts those increments complete, which a trajectory
 *   read as streaming holds either of.
 * - A kit is the kit of both, each by the rule that kit's own merge states: the
 *   events of the two as {@link EventKit.Merged} reads them, the tools of the two
 *   as `Toolkit.merge` reads them, the metrics as {@link MetricKit.Merged} reads
 *   them, and the extra data as {@link ExtraKit.Merged} reads them — a
 *   contribution both name being the one of the trajectory merged second, so a kit
 *   one of them states a newer version of states over the one the other was read
 *   with.
 *
 * @see {@link merge} for the trajectory it is the config of.
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
 * Merges two trajectories into one, named by an id: the parts of the left, then the parts
 * of the right, read with the kits of both.
 *
 * **When to use**
 *
 * Use when two trajectories are read together rather than side by side — two halves of
 * a session, a run and what was produced of it elsewhere — so that what either holds
 * is read with the kits the other was produced with, and their parts read as the
 * parts of one trajectory.
 *
 * **Details**
 *
 * - The id is bound before the two trajectories, as the terms of a trajectory are bound
 *   before what it is made of: `merge(id)` returns the function the two are merged by,
 *   and `merge(left, right)` is the same call named by a new uuid ({@link Trajectory}).
 * - The parts of the left arrive before the parts of the right, and neither is
 *   rewritten: a part is carried as it is, so what the merged trajectory is read with
 *   is added to rather than chosen between ({@link MergedConfig}), and the reading
 *   fails with what either of the two fails with.
 * - Merging is not reconciliation: the parts keep the `uuid` and the session they
 *   were produced with, so two parts of one `uuid` remain two parts, and a session
 *   both trajectories declare is one session of the merged trajectory that the parts
 *   of both belong to. What a fork names is read against the parts of the merged
 *   trajectory, which hold every part of either.
 * - The metric kit of the merged trajectory states the producers of the two where
 *   both state theirs, and none where one does not, as {@link MetricKit.Merged}
 *   reads the two: a kit that states the producer of some of its metrics alone is not
 *   one {@link Metric.produce} can run.
 *
 * **Example** (Reading two halves of a session as one trajectory)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { EventKit, ExtraKit, MetricKit, Produce, Prompt, Toolkit, Trajectory } from "@trajs/core"
 *
 * const extrakit = ExtraKit.empty
 * const metrickit = MetricKit.toProducers(MetricKit.empty, {})
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 *
 * // What a half of the session is produced and read with.
 * const config = Trajectory.config({
 *   stream: true,
 *   toolkit: Toolkit.empty,
 *   eventkit: EventKit.empty,
 *   metrickit,
 *   extrakit
 * })
 *
 * // A half of the session: what was asked, produced as a trajectory of its own.
 * const half = (content: string) =>
 *   Produce.fromSession(config)(Stream.make(
 *     Trajectory.parts(config).prompt(Prompt.make(content), { sessionId })
 *   ))
 *
 * const merged = Trajectory.merge("01890a5d-ac96-774b-bcce-b302099a8058")(
 *   half("What is 2 + 2?"),
 *   half("And 2 + 3?")
 * )
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(merged)))
 * parts.map((part) => part._tag) // => ["Prompt", "Prompt"]
 * merged.id // => "01890a5d-ac96-774b-bcce-b302099a8058"
 * merged.stream // => true
 * ```
 *
 * @see {@link MergedConfig} for what the merged trajectory is read with.
 * @see {@link EventKit.merge} for how the kits of the two are added to each other.
 * @category combinators
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

/**
 * The trajectory the two trajectories given merge into, named by `id`: what {@link merge}
 * states once for both of its call styles.
 */
const merged = <Id extends string, Left extends AnyConfig, Right extends AnyConfig, E, R, E2, R2>(
  id: Id,
  left: Trajectory<string, Left, E, R>,
  right: Trajectory<string, Right, E2, R2>,
): Trajectory<Id, MergedConfig<Left, Right>, E | E2, R | R2> => {
  // The config is the one `MergedConfig` reads off the two trajectories — a kit is each
  // kit's own merge of the two, and the variant is the one either of them streams in —
  // so what is merged is a trajectory of that config, and the parts of the two are
  // what a trajectory of it holds.
  const stated = config({
    stream: left.stream || right.stream,
    toolkit: Toolkit.merge(left.toolkit, right.toolkit),
    eventkit: EventKit.merge(left.eventkit, right.eventkit),
    metrickit: MetricKit.merge(left.metrickit, right.metrickit),
    extrakit: ExtraKit.merge(left.extrakit, right.extrakit),
  });

  // SAFETY: the parts merged are those of both, which `stated` reads as such: the parts of a
  // trajectory whose response parts are whole are members of the streaming schema too, and a
  // merged trajectory that streams states nothing of the parts of one that does not.
  return make(
    id,
    stated,
  )(Stream.concat(left, right) as TrajectoryStream<MergedConfig<Left, Right>, E | E2, R | R2>);
};
