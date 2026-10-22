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
 * {@link toSessions}: the sessions a trajectory holds, each with the parts it produced
 * and the ones it inherited ({@link Session}).
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
import { DateTime, Effect, Option, Schema, Stream } from "effect";

import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import type { EncodingServices, Readable } from "#/internal/parts.ts";
import { Timestamp, Uuid } from "#/internal/schema.ts";
import { read, readCached } from "#/internal/sessions.ts";
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
 *   id, so a fork relates two parts ({@link Fork}). A session is declared before the
 *   parts it produces, so a fork names a part the trajectory already reached — see
 *   {@link TrajectoryError.SessionError} for what reading one fails with where it has
 *   not.
 * - `extra` is the extra data the kit declares of a session part
 *   ({@link Extra.ExtraRecord}).
 *
 * @see {@link parts} for building a part under the config of its trajectory.
 * @see {@link toSessions} for reading a trajectory as its sessions.
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
 *   `fork` names, so a caller that replays a part states the one it had ({@link Fork}).
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
   * from rather than that session's id — see {@link Fork}.
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
 * The session a session continues from, and the part of it that it continues from.
 *
 * **When to use**
 *
 * Use to follow a session back to the one it was started from — to show where a session
 * was forked off another, or to read what it ran on before the parts of its own.
 *
 * **Details**
 *
 * `session` is the id of the session that produced the part, and `part` the `uuid` of the
 * part itself: a `fork` names a part rather than a session, so what a session inherited is
 * what the session it continues from produced up to and including that part. It is the
 * `uuid` of a {@link SessionPart} or of a prompt or response part — the parts a session
 * continues from — and never of an event, which no session continues from.
 *
 * A session that continues from nothing has no `fork`, and its {@link Session.forkedFrom}
 * is `None`. A `fork` naming a part the trajectory does not hold by the time the
 * declaration reading it is read is one no session can be read as: the reading fails with
 * a {@link TrajectoryError} rather than reading the session as one that continues from
 * nothing (see {@link toSessions}).
 *
 * @see {@link Session.forkedFrom} for the fork a session is read with.
 * @see {@link Session.stream} for what a session runs on through one.
 * @see {@link SessionPart} for the part that declares a fork.
 * @category models
 */
export interface Fork {
  readonly session: string;
  readonly part: string;
}

/**
 * The parts of one session of a trajectory.
 *
 * **When to use**
 *
 * Use to type what {@link Session.stream} is, or to hand the parts of one session to a
 * function that reads them.
 *
 * **Details**
 *
 * - What it holds is what the session ran on: the parts of the sessions it continues from, up to
 *   the part each of them is continued from, and the parts it produced itself — the prompts it
 *   was given, the responses it was answered with, and the events a kit produced of it — in the
 *   order the trajectory holds them.
 * - It holds no {@link SessionPart}: a declaration names the session it declares rather than
 *   being a part of it.
 * - It holds the metric parts attached to the parts of the session, wherever they were produced:
 *   a metric part names no session of its own, so the one a producer derived of a part of this
 *   session is a part of it, and one derived of parts of two sessions is a part of both
 *   ({@link MetricPart}).
 * - It is a reading that may be taken as often as it is asked for: the parts are read out of
 *   what {@link toSessions} kept rather than out of the trajectory, which is one stream that is
 *   read once.
 *
 * @see {@link Session.stream} for the parts a session runs on.
 * @see {@link toSessions} for the reading they are taken by.
 * @category models
 */
export type SessionStream<Config extends AnyConfig, E = never, R = never> = Stream.Stream<
  Exclude<Part<Config>, SessionPart<Config["extrakit"]>>,
  E,
  R
>;

/**
 * One session of a trajectory.
 *
 * **When to use**
 *
 * Use to read a trajectory one session at a time rather than as the single order its parts
 * arrived in — to show a session with what it continued from, to score it, or to continue
 * it.
 *
 * **Details**
 *
 * - `stream` is the parts the session ran on: what it inherited from the sessions it continues
 *   from, up to the part each of them is continued from, and the parts it produced itself
 *   ({@link SessionStream}).
 * - `forkedFrom` is the session it continues from and the part of it that it continues from,
 *   and is `None` for a session that continues from nothing ({@link Fork}).
 * - The sessions forked off a session are the ones whose `forkedFrom` names it, and a session is
 *   looked up by the id the trajectory names it by ({@link Sessions}, {@link session}).
 * - The parts of a session are read out of what {@link toSessions} kept rather than out of the
 *   trajectory, so a session is read as often as it is asked for, and a session forked off
 *   another reads the parts of that one again rather than repeating them.
 *
 * @see {@link Sessions} for the sessions of a trajectory as a whole.
 * @see {@link SessionStream} for the parts it runs on.
 * @see {@link toSessions} for reading a trajectory as them.
 * @category models
 */
export interface Session<Config extends AnyConfig, E = never, R = never> {
  readonly id: string;
  readonly forkedFrom: Option.Option<Fork>;
  readonly stream: SessionStream<Config, E, R>;
}

/**
 * The sessions of a trajectory, by the id each is named by.
 *
 * **When to use**
 *
 * Use to look a session up by an id ({@link session}), or to read every session of a
 * trajectory — which is what {@link View.conversations} is given.
 *
 * **Details**
 *
 * A trajectory names a session by declaring it, or by producing a part in it, so the record
 * holds the sessions the trajectory names in the order it first named them: the ones that
 * continue from nothing, and the ones forked off them. Each is read with what the trajectory
 * is read with ({@link toSessions}).
 *
 * @see {@link toSessions} for reading a trajectory as them.
 * @see {@link session} for the session one id names.
 * @category models
 */
export type Sessions<Config extends AnyConfig, E = never, R = never> = Readonly<
  Record<string, Session<Config, E, R>>
>;

/**
 * Reads a trajectory as the sessions it names.
 *
 * **When to use**
 *
 * Use to read a trajectory by its sessions rather than by the single order its parts
 * arrived in — to show what each session ran on, to score one of them, or to continue one.
 *
 * **Details**
 *
 * - The trajectory is read once, and its parts are kept in a store of bytes as they arrive:
 *   the frames the exchange format carries a part in ({@link Exchange.Part}), without the
 *   header and the metadata a trajectory is written with. A session is then read by filtering
 *   those parts from the head into it — the parts of the sessions it continues from, up to the
 *   part each of them is continued from, the parts it produced itself, and the metric parts
 *   attached to them ({@link SessionStream}) — so a session is read as often as it is asked
 *   for, and a session forked off another runs on what it inherited rather than repeating it.
 *   Keeping them is what makes that possible: a trajectory is one stream, and one stream is
 *   read once.
 * - Two things are taken to hold, neither of which can be waited for: a session is declared
 *   before the parts it produced, and a `fork` names a part the trajectory holds by the time
 *   the declaration reading it is read. A session the trajectory names by a part of it rather
 *   than by a declaration is read as one that continues from nothing. A trajectory that
 *   declares a session after the parts it produced, or reaches a session before the part it
 *   continues from — which is what a cycle of forks is — fails with the
 *   {@link TrajectoryError} that names the session and what is wrong with it.
 * - The parts are kept in memory, for as long as the program runs: a program that reads the
 *   sessions after that — one that keeps the parts of a trajectory somewhere else, a file system
 *   or a database — reads them with {@link toSessionsCached}, whose store it provides.
 *
 * It fails with `E`, on top of the failure of writing or reading the parts ({@link ByteStoreError}
 * and {@link TrajectoryError}), and requires the services `R` names beside the ones the parts
 * of its config are written with ({@link Exchange.EncodingServices}).
 *
 * **Example** (Reading a trajectory as the sessions it names)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Prompt, Response, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * // One session asks and is answered, and a session forked off the answer asks again.
 * const asked = part.prompt(Prompt.make("What is a fork?"), { sessionId: "asking" })
 * const answered = part.response(
 *   Response.makePart("text", { text: "It is a session that continues another." }),
 *   { sessionId: "asking" }
 * )
 *
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.session("asking"),
 *     asked,
 *     answered,
 *     part.session("reply", { fork: answered.uuid }),
 *     part.prompt(Prompt.make("And what does it hold?"), { sessionId: "reply" })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Trajectory.toSessions(trajectory))
 * const reply = Option.getOrThrow(Trajectory.session("reply")(sessions))
 *
 * // What a session's model ran on is what it inherited, up to the part it continues from,
 * // and what it produced itself — and no declaration, which is not a part of a session.
 * const stream = Array.from(await Effect.runPromise(Stream.runCollect(reply.stream)))
 * stream.map((part) => part._tag) // => ["Prompt", "Response", "Prompt"]
 *
 * // What it continues from is read from the declaration of the session it was forked off.
 * Option.getOrThrow(reply.forkedFrom).session // => "asking"
 * ```
 *
 * @see {@link Session} for one session of a trajectory.
 * @see {@link session} for the session one id names.
 * @see {@link toSessionsCached} for reading them through a store a program provides.
 * @see {@link View.conversations} for the conversations they ran in.
 * @category constructors
 */
export const toSessions = <Config extends AnyConfig, E, R>(
  trajectory: Trajectory<string, Config, E, R> & Readable<Config>,
): Effect.Effect<
  Sessions<Config, TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config>
> => read(trajectory);

/**
 * Reads a trajectory as the sessions it names, keeping its parts in the store a program provides.
 *
 * **When to use**
 *
 * Use where the parts of a trajectory are to be kept beyond the memory of one reading — in a
 * file system, a database, or a store a program already holds — so that the sessions read of
 * them are served from there rather than from memory this reading states.
 *
 * **Details**
 *
 * What it reads is what {@link toSessions} reads — one pass over the trajectory, its parts kept
 * as the frames the exchange format carries a part in, and a session read by filtering them into
 * it — and the difference is where they are kept: in the store a program provides
 * ({@link ByteStore}) rather than in memory. The store is what this reading requires and one
 * through {@link toSessions} does not: `ByteStore.layer` keeps the parts in memory,
 * `ByteStore.layerKVStore` in the key/value store a program states, and a store of a program's
 * own is a layer of its own. Its scope must outlive the sessions read of it, since a session is
 * read out of those parts as often as it is asked for.
 *
 * The parts are kept under a key of their own — a sequence per reading — so a store serves the
 * readings of more than one trajectory without them meeting.
 *
 * It fails with `E`, on top of the failure of writing or reading the parts ({@link ByteStoreError}
 * and {@link TrajectoryError}), and requires the services `R` names, the store, and the ones the
 * parts of its config are written with ({@link Exchange.EncodingServices}).
 *
 * **Example** (Reading a trajectory as the sessions it names, through a store a program holds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Prompt, Response, Trajectory } from "@trajs/core"
 * import { ByteStore } from "@trajs/utils/ByteStore"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.prompt(Prompt.make("What is a fork?"), { sessionId: "asking" }),
 *     part.response(Response.makePart("text", { text: "A session that continues another." }), {
 *       sessionId: "asking"
 *     })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(
 *   Trajectory.toSessionsCached(trajectory).pipe(Effect.provide(ByteStore.layer()))
 * )
 *
 * Option.isSome(Trajectory.session("asking")(sessions)) // => true
 * ```
 *
 * @see {@link toSessions} for reading them into memory instead.
 * @see {@link Session} for one session of a trajectory.
 * @see {@link ByteStore} for the store the parts are kept in.
 * @category constructors
 */

/**
 * Reads a trajectory as the sessions it names, keeping its parts in the store a program provides.
 *
 * **When to use**
 *
 * Use where the parts of a trajectory are to be kept beyond the memory of one reading — in a
 * file system, a database, or a store a program already holds — so that the sessions read of
 * them are served from there rather than from memory this reading states.
 *
 * **Details**
 *
 * What it reads is what {@link toSessions} reads — one pass over the trajectory, its parts kept
 * as the frames the exchange format carries a part in, and a session read by filtering them into
 * it — and the difference is where they are kept: in the store a program provides
 * ({@link ByteStore}) rather than in memory. The store is what this reading requires and one
 * through {@link toSessions} does not: `ByteStore.layer` keeps the parts in memory,
 * `ByteStore.layerKVStore` in the key/value store a program states, and a store of a program's
 * own is a layer of its own. Its scope must outlive the sessions read of it, since a session is
 * read out of those parts as often as it is asked for.
 *
 * The parts are kept under a key of their own — a sequence per reading — so a store serves the
 * readings of more than one trajectory without them meeting.
 *
 * It fails with `E`, on top of the failure of writing or reading the parts ({@link ByteStoreError}
 * and {@link TrajectoryError}), and requires the services `R` names, the store, and the ones the
 * parts of its config are written with ({@link Exchange.EncodingServices}).
 *
 * **Example** (Reading a trajectory as the sessions it names, through a store a program holds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Prompt, Response, Trajectory } from "@trajs/core"
 * import { ByteStore } from "@trajs/utils/ByteStore"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.prompt(Prompt.make("What is a fork?"), { sessionId: "asking" }),
 *     part.response(Response.makePart("text", { text: "A session that continues another." }), {
 *       sessionId: "asking"
 *     })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(
 *   Trajectory.toSessionsCached(trajectory).pipe(Effect.provide(ByteStore.layer()))
 * )
 *
 * Option.isSome(Trajectory.session("asking")(sessions)) // => true
 * ```
 *
 * @see {@link toSessions} for reading them into memory instead.
 * @see {@link Session} for one session of a trajectory.
 * @see {@link ByteStore} for the store the parts are kept in.
 * @category constructors
 */
export const toSessionsCached = <Config extends AnyConfig, E, R>(
  trajectory: Trajectory<string, Config, E, R> & Readable<Config>,
): Effect.Effect<
  Sessions<Config, TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config> | ByteStore
> => readCached(trajectory);

/**
 * The session of a trajectory that the id given names.
 *
 * **When to use**
 *
 * Use to read one session by the id the trajectory names it by, rather than reading every
 * session of a trajectory to find it.
 *
 * **Details**
 *
 * It is a lookup of what {@link toSessions} read ({@link Sessions}), so it needs nothing and
 * fails for nothing: an id the trajectory names no session by is `None`.
 *
 * **Example** (Looking one session up by its id)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Prompt, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.session("asking"),
 *     part.prompt(Prompt.make("What is a fork?"), { sessionId: "asking" })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Trajectory.toSessions(trajectory))
 *
 * Option.isSome(Trajectory.session("asking")(sessions)) // => true
 * Option.isSome(Trajectory.session("replying")(sessions)) // => false
 * ```
 *
 * @see {@link Sessions} for the record it reads.
 * @see {@link toSessions} for the sessions it is looked up in.
 * @category combinators
 */
export const session =
  (id: string) =>
  <Config extends AnyConfig, E, R>(
    sessions: Sessions<Config, E, R>,
  ): Option.Option<Session<Config, E, R>> =>
    Option.fromUndefinedOr(sessions[id]);

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
