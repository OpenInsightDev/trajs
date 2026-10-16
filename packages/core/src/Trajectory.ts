/**
 * The parts a recording is made of, and the trajectory they arrive in.
 *
 * A trajectory is one stream of parts in total order — the prompts a model was
 * given, the responses it returned, the session each was recorded in, and the events
 * and metrics a kit recorded of them — together with what those parts are read with:
 * {@link Trajectory} is that stream, {@link TrajectoryStream} one that states nothing
 * of itself, and {@link Part} what a part of a config is. Two trajectories are read as
 * one by {@link merge}, which adds the parts and the kits of each to the other's.
 *
 * What a part is read as is what a kit states of it: a response part's response
 * through the toolkit it was recorded with, and the extra data of a prompt, response
 * or session part through the extra kit — see {@link Extra.ExtraRecord}. A part
 * schema is therefore created for the kit it is read with ({@link PromptPart},
 * {@link SessionPart}, {@link ResponsePart}, {@link EventPart}, {@link MetricPart}),
 * and a part is built with that same kit and the fields it holds
 * ({@link promptPart}, {@link sessionPart}, {@link responsePart}).
 */

import { Effect, Schema, Stream } from "effect";

import * as Event from "#/Event.ts";
import * as Extra from "#/Extra.ts";
import * as Metric from "#/Metric.ts";
import * as Prompt from "#/Prompt.ts";
import * as Response from "#/Response.ts";
import * as Toolkit from "#/Toolkit.ts";

import { Timestamp, Uuid } from "./internal/schema.ts";
import type { Select } from "./internal/types.ts";

/**
 * The extra data a part holds, read as the kit declares it of the part it is: a part a
 * recording states no extra data of holds none.
 */
const extraField = <K extends Extra.AnyKit, P extends Extra.Part>(extrakit: K, part: P) =>
  Extra.ExtraRecord(extrakit, part).pipe(Schema.withDecodingDefault(Effect.succeed({})));

/**
 * Creates the schema of a prompt part, as the extra kit given reads its extra data.
 *
 * **When to use**
 *
 * Use to read or write the prompt parts of a recording, or to build a schema of
 * your own over this one — one whose messages are carried the way a file carries
 * them, say, as {@link Exchange.Part} does.
 *
 * **Details**
 *
 * - `messages` are the messages a model was given, as `effect/ai` states them, and
 *   `sessionId` the session the part was recorded in.
 * - `uuid` identifies the part itself, and is what the `fork` of a
 *   {@link SessionPart} names; `.make` gives a part a fresh one.
 * - `extra` is the extra data the kit declares of a prompt part, keyed by the tag
 *   of each kind: {@link Extra.ExtraRecord}. A part recorded stating none holds
 *   none, so a recording written before an extension declared its data still reads.
 *
 * A datum of a kind the kit declares of another part alone is carried as it was
 * written rather than read, since what a kit states of a prompt part is all it knows
 * of one.
 *
 * @see {@link promptPart} for building a part of this schema.
 * @see {@link Extra.ExtraRecord} for the extra data a part holds.
 * @category schemas
 */
export const PromptPart = <K extends Extra.AnyKit>(extrakit: K) =>
  Schema.TaggedStruct("Prompt", {
    messages: Schema.Array(Prompt.Message),
    extra: extraField(extrakit, "prompt"),
    sessionId: Schema.String,
    uuid: Uuid,
  });

/**
 * A prompt part as the kit given reads its extra data.
 *
 * @see {@link PromptPart} for the schema it is read by.
 * @category models
 */
export type PromptPart<K extends Extra.AnyKit> = Schema.Schema.Type<
  ReturnType<typeof PromptPart<K>>
>;

/**
 * A {@link PromptPart} as it is encoded: the messages as a recording states them,
 * and the extra data of every kind the kit declares of the part.
 *
 * @see {@link PromptPart} for the part itself.
 * @category models
 */
export type PromptPartEncoded = Schema.Codec.Encoded<ReturnType<typeof PromptPart<Extra.AnyKit>>>;

/**
 * Builds a prompt part from the prompt a model was given.
 *
 * **When to use**
 *
 * Use where what a model was given is recorded, so that the prompt stands among the
 * parts of its trajectory rather than beside them.
 *
 * **Details**
 *
 * - The kit is asked for first ({@link PromptPart}) and the fields of the part
 *   second, as a reader takes the kits it reads with before the bytes it reads: the
 *   kit is what says how the extra data of the part is read, so a part is built
 *   stating the extra data of that kit rather than of none.
 * - `messages` are the content of the prompt given, and `sessionId` the session the
 *   part is recorded in.
 * - `extra` may be left out, and the part then states none of it. A datum the kit
 *   does not declare of a prompt part is refused where the part is built, since a
 *   kit reads back what it states and nothing else.
 *
 * **Example** (Recording what a model was given, with what it was estimated to cost)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extra, Prompt, Trajectory, VersionedSchema } from "@trajs/core"
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
 * const part = Trajectory.promptPart(Extra.makeKit(estimate))({
 *   prompt: Prompt.make("What is 2 + 2?"),
 *   sessionId: "01890a5d-ac96-774b-bcce-b302099a8057",
 *   extra: { "tokenize/estimate": { version: "0.1.0", tokens: 7 } }
 * })
 *
 * part.messages.map((message) => message.role) // => ["user"]
 * part.extra["tokenize/estimate"]?.tokens // => 7
 * ```
 *
 * @see {@link PromptPart} for the schema the part is built of.
 * @see {@link Extra.ExtraRecord} for the extra data a part holds.
 * @category constructors
 */
export const promptPart =
  <K extends Extra.AnyKit>(extrakit: K) =>
  ({
    prompt,
    sessionId,
    extra = {},
  }: {
    prompt: Prompt.Prompt;
    sessionId: string;
    extra?: Extra.ExtraRecord<K["extra"], "prompt">;
  }) =>
    PromptPart(extrakit).make({ messages: prompt.content, sessionId, extra });

/**
 * Creates the schema of a session part, as the extra kit given reads its extra
 * data.
 *
 * **When to use**
 *
 * Use to read or write the session declarations of a recording, or to build a
 * schema of your own over this one.
 *
 * **Details**
 *
 * - `id` names the session the parts after the declaration are recorded in, and
 *   `uuid` identifies the declaration itself.
 * - `fork` names the part a session continues from, where it is one that continues
 *   from another: it is the `uuid` of a part of the session forked from rather than
 *   the id of that session, so a fork relates two parts and the sessions holding
 *   them. A session is declared before the parts it records, so a fork names a part
 *   the recording has already reached — see {@link TrajectoryError.SessionError}
 *   for what reading one fails with where it has not.
 * - `extra` is the extra data the kit declares of a session part, as
 *   {@link Extra.ExtraRecord} reads it.
 *
 * @see {@link sessionPart} for building a part of this schema.
 * @see {@link Session.sessions} for reading a trajectory as its sessions.
 * @category schemas
 */
export const SessionPart = <K extends Extra.AnyKit>(extrakit: K) =>
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
export type SessionPart<K extends Extra.AnyKit> = Schema.Schema.Type<
  ReturnType<typeof SessionPart<K>>
>;

/**
 * A {@link SessionPart} as it is encoded: the id of the session and the part it
 * forks from as a recording states them, and the extra data of the part.
 *
 * @see {@link SessionPart} for the part itself.
 * @category models
 */
export type SessionPartEncoded = Schema.Codec.Encoded<ReturnType<typeof SessionPart<Extra.AnyKit>>>;

/**
 * Builds a session part: the declaration of a session a trajectory records in.
 *
 * **When to use**
 *
 * Use where a recording declares the session its parts belong to, or the fork a
 * session continues from.
 *
 * **Details**
 *
 * - The kit is asked for first ({@link SessionPart}) and the fields of the part
 *   second, as a reader takes the kits it reads with before the bytes it reads, so
 *   that the part states the extra data of that kit rather than of none.
 * - `fork` is the `uuid` of the part the session continues from — the part of
 *   another session rather than the session itself — and `extra` may be left out,
 *   the part then stating none of it.
 *
 * **Example** (Continuing a session from the part a fork left off at)
 *
 * ```ts import.meta.vitest
 * import { Extra, Trajectory } from "@trajs/core"
 *
 * const extrakit = Extra.makeKit()
 *
 * const root = Trajectory.sessionPart(extrakit)({
 *   id: "01890a5d-ac96-774b-bcce-b302099a8057"
 * })
 *
 * const forked = Trajectory.sessionPart(extrakit)({
 *   id: "01890a5d-ac96-774b-bcce-b302099a8058",
 *   fork: root.uuid
 * })
 *
 * forked.fork === root.uuid // => true
 * ```
 *
 * @see {@link SessionPart} for the schema the part is built of.
 * @see {@link Session.sessions} for reading a trajectory as its sessions.
 * @category constructors
 */
export const sessionPart =
  <K extends Extra.AnyKit>(extrakit: K) =>
  ({
    id,
    fork,
    extra = {},
  }: {
    id: string;
    fork?: string;
    extra?: Extra.ExtraRecord<K["extra"], "session">;
  }) =>
    SessionPart(extrakit).make({ id, fork, extra });

const responseFields = {
  timestamp: Timestamp,
  sessionId: Schema.String,
  uuid: Uuid,
};

/** The response part schema that reads the whole parts a model returned. */
const NonStreamResponsePart = <T extends Toolkit.Any, K extends Extra.AnyKit>(
  toolkit: T,
  extrakit: K,
) =>
  Schema.TaggedStruct("Response", {
    response: Response.PartView(toolkit),
    extra: extraField(extrakit, "response"),
    ...responseFields,
  });

/** The response part schema that reads every part a response may hold. */
const StreamResponsePart = <T extends Toolkit.Any, K extends Extra.AnyKit>(
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
  Extrakit extends Extra.AnyKit,
  Stream extends boolean,
> = Select<
  Stream,
  ReturnType<typeof StreamResponsePart<Toolkit, Extrakit>>,
  ReturnType<typeof NonStreamResponsePart<Toolkit, Extrakit>>
>;

/**
 * Creates the schema of a response part, in the variant the config given asks for.
 *
 * **When to use**
 *
 * Use to read or write the response parts of a recording: what a model answered a
 * prompt with, whether it answered it whole or arrived at that answer in increments.
 *
 * **Details**
 *
 * - `stream` says what the `response` of a part is: `true` reads every part a
 *   response may hold — the increments a streamed response arrived in and the whole
 *   parts those increments complete — and `false` the whole parts alone. A recording
 *   is read as the most general trajectory, so the parts of a folded one are members
 *   of the streaming schema too — see {@link Exchange.Part}.
 * - `toolkit` is what the response is read by: the tool call and tool result parts of
 *   its tools as those tools state them, and a part naming a tool the toolkit no
 *   longer holds as the part it was recorded as rather than not at all — see
 *   {@link Response.AllPartsView}.
 * - `extrakit` reads the extra data of the part as {@link Extra.ExtraRecord} reads it,
 *   and `timestamp`, `sessionId` and `uuid` are the fields every response part is
 *   recorded with.
 *
 * The response of a part is read through the toolkit, so encoding one takes what
 * those tools state — see {@link Exchange.EncodingServices}.
 *
 * **Example** (Writing a response as the increments a model returned it in)
 *
 * ```ts import.meta.vitest
 * import { Extra, Response, Toolkit, Trajectory } from "@trajs/core"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const schema = Trajectory.ResponsePart({
 *   toolkit: Toolkit.empty,
 *   extrakit: Extra.makeKit(),
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
 * @see {@link responsePart} for building a part of this schema.
 * @see {@link ResponsePartEncoded} for the encoded form of a part.
 * @see {@link Response.AllPartsView} for what the response of a part is read as.
 * @category schemas
 */
export const ResponsePart = <
  Toolkit extends Toolkit.Any,
  Extrakit extends Extra.AnyKit,
  Stream extends boolean,
>({
  toolkit,
  extrakit,
  stream,
}: {
  toolkit: Toolkit;
  extrakit: Extrakit;
  stream: Stream;
}): AllResponseParts<Toolkit, Extrakit, Stream> =>
  // SAFETY: `AllResponseParts` selects the codec pair by `Stream`, so the branch
  // taken is the pair the return type names.
  (stream
    ? StreamResponsePart(toolkit, extrakit)
    : NonStreamResponsePart(toolkit, extrakit)) as AllResponseParts<Toolkit, Extrakit, Stream>;

/**
 * A response part as the toolkit and the extra kit given read it, in the variant
 * asked for.
 *
 * @see {@link ResponsePart} for the schema it is read by.
 * @category models
 */
export type ResponsePart<
  Toolkit extends Toolkit.Any,
  Extrakit extends Extra.AnyKit,
  Stream extends boolean,
> = Schema.Schema.Type<AllResponseParts<Toolkit, Extrakit, Stream>>;

/**
 * A {@link ResponsePart} as it is encoded, in the variant a recording states.
 *
 * **When to use**
 *
 * Use to type what a recording holds of a response part, such as to carry one in a
 * format of your own.
 *
 * **Details**
 *
 * A recording is read as the most general trajectory, whose response parts are the
 * streams they arrived in, so the encoded part is stated as the streaming variant:
 * the folded response parts of a trajectory of another kind are members of that
 * schema too, as {@link ResponsePart} says.
 *
 * @see {@link ResponsePart} for the part itself.
 * @see {@link Exchange.Part} for the parts a recording carries.
 * @category models
 */
export type ResponsePartEncoded = Schema.Codec.Encoded<
  ReturnType<typeof ResponsePart<Toolkit.Any, Extra.AnyKit, true>>
>;

/**
 * Builds a response part from one part of what a model returned.
 *
 * **When to use**
 *
 * Use where what a model returned is recorded, so that the response stands among
 * the parts of its trajectory rather than beside them.
 *
 * **Details**
 *
 * - The kit is asked for first ({@link ResponsePart}) and the fields of the part
 *   second, as a reader takes the kits it reads with before the bytes it reads: the
 *   toolkit is what says how the response of the part is read and the extra kit how
 *   its extra data is, so a part is built stating the extra data of that kit rather
 *   than of none.
 * - `response` is one part of what the model returned, as {@link Response.makePart}
 *   builds one: an increment the response arrived in where the config streams, and a
 *   part the response is whole in where it does not.
 * - `sessionId` names the session the part is recorded in; the `timestamp` and the
 *   `uuid` of the part are supplied where it is built, as they are for every other
 *   part.
 * - `extra` may be left out, and the part then states none of it, as a prompt part
 *   that states none does.
 *
 * **Example** (Recording what a model returned, with what it was estimated to cost)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extra, Response, Toolkit, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const estimate = new Extra.Extra({
 *   package: "tokenize",
 *   id: "estimate",
 *   response: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const part = Trajectory.responsePart({
 *   toolkit: Toolkit.empty,
 *   extrakit: Extra.makeKit(estimate),
 *   stream: false
 * })({
 *   response: Response.makePart("text", { text: "4" }),
 *   sessionId: "01890a5d-ac96-774b-bcce-b302099a8057",
 *   extra: { "tokenize/estimate": { version: "0.1.0", tokens: 3 } }
 * })
 *
 * part.response.type // => "text"
 * part.extra["tokenize/estimate"]?.tokens // => 3
 * ```
 *
 * @see {@link ResponsePart} for the schema the part is built of.
 * @see {@link Response.makePart} for building the response of a part.
 * @category constructors
 */
export const responsePart =
  <Toolkit extends Toolkit.Any, Extrakit extends Extra.AnyKit, Stream extends boolean>({
    toolkit,
    extrakit,
    stream,
  }: {
    toolkit: Toolkit;
    extrakit: Extrakit;
    stream: Stream;
  }) =>
  ({
    response,
    sessionId,
    extra = {},
  }: {
    response: ResponsePart<Toolkit, Extrakit, Stream>["response"];
    sessionId: string;
    extra?: Extra.ExtraRecord<Extrakit["extra"], "response">;
  }): ResponsePart<Toolkit, Extrakit, Stream> =>
    // SAFETY: `ResponsePart` selects its variant by `stream`, which the fields were
    // read under, so what it makes is the part they state; TypeScript leaves that
    // selection unevaluated where `stream` is a type parameter and reads the part it
    // makes as the streaming one alone.
    ResponsePart({ toolkit, extrakit, stream }).make({
      response,
      sessionId,
      extra,
    }) as ResponsePart<Toolkit, Extrakit, Stream>;

/**
 * Creates the schema of an event part, as the event kit given reads the event it
 * names.
 *
 * **When to use**
 *
 * Use to read or write the events of a recording — what a run recorded of itself
 * rather than what was said — or to build a schema of your own over this one.
 *
 * **Details**
 *
 * - `event` is the event of the kit the part names, read as
 *   {@link Event.EventPartsView} reads one: by the schema of the event at the version
 *   the part was written at, or as the pair it was recorded as where the kit names
 *   no such event or the data no longer states that version.
 * - `timestamp` is when the event was recorded, which `.make` supplies as the time
 *   the part is built, and `sessionId` and `uuid` say where it was recorded and
 *   which part it is.
 *
 * An event part holds no extra data: a kit states what an event is, and what an
 * extension declares of a part is an {@link Extra} — see {@link Extra.Part} for the
 * parts one is declared of.
 *
 * @see {@link Event.EventPartsView} for the events a part is read as.
 * @see {@link Extra.Part} for the parts extra data is declared of.
 * @category schemas
 */
export const EventPart = <K extends Event.AnyKit>(kit: K) =>
  Schema.TaggedStruct("Event", {
    event: Event.EventPartsView(kit),
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
export type EventPart<K extends Event.AnyKit> = Schema.Schema.Type<ReturnType<typeof EventPart<K>>>;

/**
 * An {@link EventPart} as it is encoded: the tag of the event it names and the data
 * of that event as a recording states them.
 *
 * @see {@link EventPart} for the part itself.
 * @category models
 */
export type EventPartEncoded = Schema.Codec.Encoded<ReturnType<typeof EventPart<Event.AnyKit>>>;

/**
 * Creates the schema of a metric part, as the metric kit given reads what the metric
 * derived.
 *
 * **When to use**
 *
 * Use to read or write what a kit derived of a recording — a count, a cost, a score
 * — so that what a recording is worth reads back without the producers that derived
 * it.
 *
 * **Details**
 *
 * - `metric` is the report of one metric of the kit, keyed by the tag of that metric
 *   and read as {@link Metric.MetricPartsView} reads one: the output a producer
 *   yielded of what it read, or the failure it reported of it.
 * - `timestamp` is when the metric was derived, where the part states it at all.
 *
 * A metric part holds no extra data, as an event part does not.
 *
 * @see {@link Metric.MetricPartsView} for what a part is read as.
 * @see {@link Metric.produce} for deriving the parts of a kit from a recording.
 * @category schemas
 */
export const MetricPart = <K extends Metric.AnyKit>(kit: K) =>
  Schema.TaggedStruct("Metric", {
    metric: Metric.MetricPartsView(kit),
    timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  });

/**
 * A metric part as the kit given reads what the metric derived.
 *
 * @see {@link MetricPart} for the schema it is read by.
 * @category models
 */
export type MetricPart<K extends Metric.AnyKit> = Schema.Schema.Type<
  ReturnType<typeof MetricPart<K>>
>;

/**
 * A {@link MetricPart} as it is encoded: the tag of the metric it reports and the
 * output or failure that metric derived, as a recording states them.
 *
 * @see {@link MetricPart} for the part itself.
 * @category models
 */
export type MetricPartEncoded = Schema.Codec.Encoded<ReturnType<typeof MetricPart<Metric.AnyKit>>>;

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
 *   recording may name, `metrickit` the metrics derived of it, and `extrakit` the
 *   extra data of its prompt, response and session parts.
 *
 * Every type parameter defaults to `never`, so a config names what it holds; the
 * config of a trajectory read without knowing its kits is {@link AnyConfig}.
 *
 * @see {@link AnyConfig} for the config that holds anything.
 * @see {@link Part} for the parts a config reads.
 * @category models
 */
export interface Config<
  Stream extends boolean = never,
  Toolkit extends Toolkit.Any = never,
  Eventkit extends Event.AnyKit = never,
  Metrickit extends Metric.AnyKit = never,
  Extrakit extends Extra.AnyKit = never,
> {
  stream: Stream;
  toolkit: Toolkit;
  eventkit: Eventkit;
  metrickit: Metrickit;
  extrakit: Extrakit;
}

/**
 * The config of a trajectory read without knowing what it holds: response parts of
 * either variant, and kits that name anything.
 *
 * **When to use**
 *
 * Use to type a reading that does not know the kits a recording was written with —
 * one that measures, displays or migrates a recording rather than acting on what it
 * holds.
 *
 * @see {@link Config} for a config that names what a trajectory holds.
 * @category models
 */
export type AnyConfig = Config<boolean, Toolkit.Any, Event.AnyKit, Metric.AnyKit, Extra.AnyKit>;

/**
 * The config of a reading whose response parts are the whole parts a model
 * returned.
 *
 * **When to use**
 *
 * Use to type a reading that measures a recording rather than acting on what it
 * holds, since what a measurement is of is the parts a model was given and
 * returned rather than the increments an answer arrived in.
 *
 * **Details**
 *
 * It is {@link AnyConfig} with `stream` off, so the increments a streamed answer
 * arrived in are not members of its response parts. An answer that arrived in
 * increments is folded into the whole parts they complete before such a reading
 * sees it — see {@link Metric.produce}.
 *
 * @see {@link AnyConfig} for the config that holds anything.
 * @category models
 */
export type NonStreamConfig = Config<false, Toolkit.Any, Event.AnyKit, Metric.AnyKit, Extra.AnyKit>;

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
  Event.EmptyKit,
  Metric.EmptyKit,
  Extra.EmptyKit
>;

/**
 * The config a recording is read with: {@link AnyConfig} as the value of a
 * trajectory that states nothing about itself.
 *
 * **When to use**
 *
 * Use to read a recording that was written with kits a program does not hold —
 * what `Exchange.Service.load` reads one with — or to name the reading of a
 * recording that states no kit of its own.
 *
 * **Details**
 *
 * Every kit of it is empty and its response parts are read as streams, so every
 * part of a recording is read as the part it was recorded as: a response part
 * whose tool the toolkit does not hold reads as the part it is rather than not at
 * all, and the extra data of a part as the kit that declared it wrote it. What a
 * recording was written with is what its header names, which is names alone —
 * {@link AnyConfig} holds anything, so what a recording holds is read without the
 * schemas it was written with.
 *
 * A recording is read as a streaming trajectory whatever it was written as, since
 * the increments of a streamed response and the whole parts those increments
 * complete are members of the streaming schema: one reading carries the response
 * parts of either kind.
 *
 * @see {@link AnyConfig} for the type this is the value of.
 * @see {@link Config} for what a config names.
 * @category constants
 */
export const anyConfig: AnyConfig = {
  stream: true,
  toolkit: Toolkit.empty,
  eventkit: Event.makeKit(),
  metrickit: Metric.makeKit(),
  extrakit: Extra.makeKit(),
};

/**
 * A part of a trajectory of the config given.
 *
 * **When to use**
 *
 * Use to type a stream of parts, or to tell the parts of a recording apart by the
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
 * @see {@link Trajectory} for the stream the parts of a recording arrive in.
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
export type TrajectoryStream<Config extends AnyConfig, E, R> = Stream.Stream<Part<Config>, E, R>;

/**
 * A trajectory: the parts of a recording as one stream, carrying what they are read
 * with.
 *
 * **When to use**
 *
 * Use to read a recording that was decoded, or to write one: a trajectory is what
 * an {@link Exchange.Service} reads a recording as, and what it writes one from.
 *
 * **Details**
 *
 * The `stream`, `toolkit`, `eventkit`, `metrickit` and `extrakit` a trajectory is
 * read with are the {@link Config} its parts are read with, and it carries that
 * config rather than stating it beside the parts: a function handed a trajectory has
 * the kits its parts were read by, and reads the extra data of a part without the
 * caller naming them again. The parts are read as they arrive rather than held whole,
 * so what a trajectory holds is read once, while the config is readable without
 * reading any of it.
 *
 * @see {@link TrajectoryStream} for the parts of a trajectory alone.
 * @see {@link Exchange.Service.read} for reading a recording as one.
 * @category models
 */
export type Trajectory<Config extends AnyConfig, E, R> = TrajectoryStream<Config, E, R> &
  Readonly<Config>;

/**
 * The config of the trajectory two trajectories merge into: the response parts of
 * either variant, and the kits of both.
 *
 * **When to use**
 *
 * Use to name what {@link merge} returns, such as to type a function that reads two
 * recordings as one.
 *
 * **Details**
 *
 * - `stream` is `true` where either of the two streams, since the response parts of
 *   a merged trajectory are those of both kinds: the increments a streamed answer
 *   arrived in, and the whole parts those increments complete, which a trajectory
 *   read as streaming holds either of.
 * - A kit is the kit of both, each by the rule that kit's own merge states: the
 *   events of the two as {@link Event.EventsMerged} reads them, the tools of the two
 *   as `Toolkit.merge` reads them, the metrics as {@link Metric.MetrickitMerged} reads
 *   them, and the extra data as {@link Extra.ExtrasMerged} reads them — a
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
  Event.Eventkit<Event.EventsMerged<readonly [Left["eventkit"], Right["eventkit"]]>>,
  Metric.MetrickitMerged<readonly [Left["metrickit"], Right["metrickit"]]>,
  Extra.Extrakit<Extra.ExtrasMerged<readonly [Left["extrakit"], Right["extrakit"]]>>
>;

/**
 * Merges two trajectories into one: the parts of the left, then the parts of the
 * right, read with the kits of both.
 *
 * **When to use**
 *
 * Use when two recordings are read together rather than side by side — two halves of
 * a session, a run and what was recorded of it elsewhere — so that what either holds
 * is read with the kits the other was recorded with, and their parts read as the
 * parts of one trajectory.
 *
 * **Details**
 *
 * - The parts of the left arrive before the parts of the right, and neither is
 *   rewritten: a part a trajectory holds is carried as it is, so what the merged
 *   trajectory is read with is added to rather than chosen between
 *   ({@link MergedConfig}), and the reading fails with what either of the two fails
 *   with.
 * - Merging is not reconciliation: the parts keep the `uuid` and the session they
 *   were recorded with, so two parts of one `uuid` remain two parts, and a session
 *   both trajectories declare is one session of the merged trajectory that the parts
 *   of both belong to. What a fork names is read against the parts of the merged
 *   trajectory, which hold every part of either.
 * - The metric kit of the merged trajectory states the producers of the two where
 *   both of them state theirs, and none where one of them does not, as
 *   {@link Metric.MetrickitMerged} reads the two: a kit that states the producer of
 *   some of its metrics alone is not one {@link Metric.produce} can run.
 *
 * **Example** (Reading two halves of a session as one trajectory)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Event, Extra, Metric, Produce, Prompt, Toolkit, Trajectory } from "@trajs/core"
 *
 * const extrakit = Extra.makeKit()
 * const metrickit = Metric.toProducers(Metric.makeKit(), {})
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 *
 * // A half of the session: what was asked, recorded as a trajectory of its own.
 * const half = (content: string) =>
 *   Produce.fromSession({
 *     toolkit: Toolkit.empty,
 *     eventkit: Event.makeKit(),
 *     metrickit,
 *     extrakit
 *   })(Stream.make(
 *     Trajectory.promptPart(extrakit)({ prompt: Prompt.make(content), sessionId })
 *   ))
 *
 * const merged = Trajectory.merge(
 *   half("What is 2 + 2?"),
 *   half("And 2 + 3?")
 * )
 *
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(merged)))
 * parts.map((part) => part._tag) // => ["Prompt", "Prompt"]
 * merged.stream // => true
 * ```
 *
 * @see {@link MergedConfig} for what the merged trajectory is read with.
 * @see {@link Event.mergeKit} for how the kits of the two are added to each other.
 * @category combinators
 */
export const merge = <Left extends AnyConfig, Right extends AnyConfig, E, R, E2, R2>(
  left: Trajectory<Left, E, R>,
  right: Trajectory<Right, E2, R2>,
): Trajectory<MergedConfig<Left, Right>, E | E2, R | R2> => {
  const parts = Stream.concat(left, right);

  // SAFETY: the config stated here is the one `MergedConfig` reads off the two
  // trajectories — a kit is each kit's own merge of the two, and the variant is the
  // one either of them streams in — so what is merged is a trajectory of that
  // config. The parts are those of both, which `Part` reads as such: the parts of a
  // trajectory whose response parts are whole are members of the streaming schema
  // too, and a merged trajectory that streams states nothing of the parts of one
  // that does not.
  return Object.assign(parts, {
    stream: left.stream || right.stream,
    toolkit: Toolkit.merge(left.toolkit, right.toolkit),
    eventkit: Event.mergeKit(left.eventkit, right.eventkit),
    metrickit: Metric.mergeKit(left.metrickit, right.metrickit),
    extrakit: Extra.mergeKit(left.extrakit, right.extrakit),
  }) as Trajectory<MergedConfig<Left, Right>, E | E2, R | R2>;
};
