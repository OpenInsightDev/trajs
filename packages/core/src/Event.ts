/**
 * Events an extension produces of a trajectory, and the parts a trajectory holds
 * them as.
 *
 * An {@link Event} is one kind of event an extension names, with the schema of
 * its data at every version it was written at, {@link makeKit} collects events
 * into a kit and {@link mergeKit} adds the events of one kit to another,
 * {@link EventParts} reads the parts of the events a kit names.
 * {@link EventPartsView} reads those parts while tolerating events the kit does
 * not name, so a trajectory another kit wrote still reads, and {@link encode}
 * reads the events of a stream as the events a caller names.
 */

import { Data, Effect, Option, Predicate, Schema, Stream } from "effect";

import type * as Trajectory from "#/Trajectory.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

import type { IndexByKey } from "./internal/types.ts";

export class Metadata extends Schema.Class<Metadata>("Metadata")({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

export class Event<
  Pkg extends string,
  Id extends string,
  S extends VersionedSchema.Any,
> extends Data.Class<{
  package: Pkg;
  id: Id;
  metadata: Metadata;
  schema: S;
}> {
  get tag(): `${Pkg}/${Id}` {
    return `${this.package}/${this.id}`;
  }
}

export type Any = Event<string, string, VersionedSchema.Any>;

type EventsByTag<Es> = IndexByKey<Es, "tag">;

export type Eventkit<Events extends Record<string, Any>> = Readonly<{
  events: Events;
}>;

export const makeKit = <Es extends ReadonlyArray<Any>>(...events: Es) => {
  // SAFETY: every event given is inserted under its own tag below, so what the record
  // holds is one event per tag the kit names.
  const output = {} as Record<string, Any>;

  for (const event of events) {
    output[event.tag] = event;
  }

  // SAFETY: `output` holds the event of every tag in `Es`, which is what `EventsByTag`
  // reads the events given as.
  return { events: output } as Eventkit<EventsByTag<Es>>;
};

export type AnyKit = Eventkit<Record<string, Any>>;

/** A kit that declares no event. */
export const emptyKit = makeKit();

/** The type of {@link emptyKit}. */
export type EmptyKit = typeof emptyKit;

/**
 * The events of the kits given as one, a tag they share holding the event of the
 * kit latest among them.
 *
 * **When to use**
 *
 * Use to name the events {@link mergeKit} returns, such as to type the kit a reader
 * that knows one trajectory's events reads another one under.
 *
 * **Details**
 *
 * The events of every kit given are named, and where two of them name the same tag
 * the one of the kit latest among those given that names it is the one held, as
 * {@link makeKit} holds the events it is handed.
 *
 * @see {@link mergeKit} for the kit those events make.
 * @category models
 */
export type EventsMerged<Ks extends ReadonlyArray<AnyKit>> = Ks extends readonly [
  infer Head extends AnyKit,
  ...infer Tail extends ReadonlyArray<AnyKit>,
]
  ? Omit<Head["events"], keyof EventsMerged<Tail>> & EventsMerged<Tail>
  : {};

/**
 * Adds the events of each kit given to the ones of the kits before it.
 *
 * **When to use**
 *
 * Use when the events of several extensions are read together, or when a reader
 * that knows some of a trajectory's events should read it under the ones it knows
 * without forgetting the rest — which is what {@link encode} does with the kit of a
 * trajectory.
 *
 * **Details**
 *
 * A tag the kits share holds the event of the kit latest among those given that
 * names it, so a kit of the version an extension states now states over the one a
 * trajectory was read with. The kit returned is a kit like any other: it names the
 * events of every kit given and no others.
 *
 * **Example** (Adding the events of one kit to another's)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Event, VersionedSchema } from "@trajs/core"
 *
 * const step = new Event.Event({
 *   package: "atif",
 *   id: "step",
 *   metadata: new Event.Metadata({ name: "Step" }),
 *   schema: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     index: Schema.Number
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const count = new Event.Event({
 *   package: "tokenize",
 *   id: "count",
 *   metadata: new Event.Metadata({ name: "Count" }),
 *   schema: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const merged = Event.mergeKit(Event.makeKit(step), Event.makeKit(count))
 * Object.keys(merged.events) // => ["atif/step", "tokenize/count"]
 * ```
 *
 * @see {@link makeKit} for a kit of the events given alone.
 * @see {@link encode} — the reader that adds events to the kit of a trajectory.
 * @category constructors
 */
export const mergeKit = <Ks extends ReadonlyArray<AnyKit>>(
  ...kits: Ks
): Eventkit<EventsMerged<Ks>> => {
  // SAFETY: every event of every kit is inserted under its own tag below, so what
  // the record holds is one event per tag the kits name.
  const events = {} as Record<string, Any>;

  for (const kit of kits) {
    Object.assign(events, kit.events);
  }

  // SAFETY: `events` holds the event of every tag in `Ks`, the one of the kit latest
  // among those that names it, which is what `EventsMerged` reads the kits as.
  return { events } as Eventkit<EventsMerged<Ks>>;
};

export type EventPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

export const EventPart = <Tag extends string, S extends Schema.Top>(
  tag: Tag,
  schema: S,
): Schema.TaggedStruct<Tag, { readonly data: S }> => Schema.TaggedStruct(tag, { data: schema });

export type EventPartEncoded = Readonly<{ _tag: string; data: unknown }>;

const AnyEventPartTypeId = "~trajs/Event/AnyEventPart" as const;

/**
 * An event part whose tag and data are not restricted by a kit.
 *
 * **When to use**
 *
 * Use to type an event part of an event the reading kit does not name, as
 * {@link EventPartsView} reads one.
 *
 * **Details**
 *
 * A part read as this carries the `~trajs/Event/AnyEventPart` marker, so
 * {@link isAnyEventPart} tells it from a part the kit read by the schema of the
 * event it names.
 *
 * @see {@link EventPart} for a part of an event a kit names.
 * @category models
 */
export type AnyEventPart = EventPart<string, unknown>;

type RuntimeAnyEventPart = AnyEventPart & {
  readonly [AnyEventPartTypeId]: typeof AnyEventPartTypeId;
};

/**
 * Type guard to check whether an event part is one an event's own schema did not
 * read.
 *
 * **When to use**
 *
 * Use to tell a part {@link EventPartsView} fell back to {@link AnyEventPart} for
 * from a part it read as the event of the kit that names it.
 *
 * @see {@link AnyEventPart} for the part it checks for.
 * @category guards
 */
export const isAnyEventPart = (u: unknown): u is RuntimeAnyEventPart =>
  Predicate.hasProperty(u, AnyEventPartTypeId);

/**
 * Schema for an event part whose tag and data are not restricted by a kit.
 *
 * **When to use**
 *
 * Use to decode or encode an event part of an event the reading kit does not
 * name.
 *
 * **Details**
 *
 * - The marker is stated on a part when it is read and omitted when it is
 *   written, so a trajectory written again holds what it did.
 * - The tag must be a string and the data must be present: nothing else of a
 *   part of an event a kit does not name is known.
 *
 * @see {@link EventPart} for the schema of a part of an event a kit names.
 * @category schemas
 */
export const AnyEventPart: Schema.Codec<AnyEventPart, EventPartEncoded> = Schema.Struct({
  [AnyEventPartTypeId]: Schema.Literal(AnyEventPartTypeId).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(AnyEventPartTypeId), { encodingStrategy: "omit" }),
  ),
  _tag: Schema.String,
  data: Schema.Unknown,
}).annotate({ identifier: "AnyEventPart" });

/** The part schema each event of a kit states, read as one. */
type EventPartSchemas<Events extends Record<string, Any>> = {
  readonly [Tag in keyof Events]: Schema.TaggedStruct<
    Tag & string,
    { readonly data: Events[Tag]["schema"] }
  >;
}[keyof Events];

export type EventParts<Events extends Record<string, Any>> = {
  readonly [Tag in keyof Events]: EventPart<
    Tag & string,
    Schema.Schema.Type<Events[Tag]["schema"]>
  >;
}[keyof Events];

export const EventParts = <K extends AnyKit>(
  kit: K,
): Schema.Union<ReadonlyArray<EventPartSchemas<K["events"]>>> => {
  const parts: Array<Schema.Top> = [];

  for (const event of Object.values(kit.events)) {
    parts.push(EventPart(event.tag, event.schema));
  }

  // SAFETY: every member is the part of one event of the kit, which is what
  // `EventPartSchemas` reads the events of a kit as.
  return Schema.Union(parts) as any;
};

/**
 * Union type for event parts that also accepts events the kit does not name.
 *
 * **When to use**
 *
 * Use to type an event part read from a trajectory that may mention events the
 * reading kit does not name.
 *
 * **Details**
 *
 * Every event part is one {@link AnyEventPart} also carries, so a value of this
 * says only that an event was produced, not which event of the kit it was:
 * {@link EventParts} is what types the parts of the events a kit names.
 *
 * @see {@link EventParts} for parts restricted to the events of the kit.
 * @category models
 */
export type EventPartsView<Events extends Record<string, Any>> = EventParts<Events> | AnyEventPart;

/**
 * The codec {@link EventPartsView} builds, named so that the codec states
 * {@link EventPartsView} as the type it reads: the union it is built from names the kit
 * of every member, so its own type reads as that kit's schema rather than as the parts
 * of an event, and the parts of one kit would not then read as the parts of another.
 */
type EventPartsViewSchema<Events extends Record<string, Any>> = Schema.Union<
  ReadonlyArray<EventPartSchemas<Events> | typeof AnyEventPart>
>;

/**
 * Creates a Schema for the parts of the events a kit names, including events the
 * kit does not name.
 *
 * **When to use**
 *
 * Use when decoding or encoding the event parts a trajectory holds that may mention events the
 * reading kit does not name.
 *
 * **Details**
 *
 * - Every event of the kit is read by its own schema, as {@link EventParts} reads
 *   it, in the order the kit holds the events.
 * - A part naming an event of the kit whose data no longer matches a version of
 *   that event's schema falls back to {@link AnyEventPart}, because reading a
 *   trajectory does not depend on the schemas it is read with.
 * - A part read as {@link AnyEventPart} is written back as it was read, so
 *   re-writing a trajectory a kit wrote does not change it.
 *
 * **Example** (Reading events the kit named and one it did not)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Event, VersionedSchema } from "@trajs/core"
 *
 * const step = new Event.Event({
 *   package: "atif",
 *   id: "step",
 *   metadata: new Event.Metadata({ name: "Step" }),
 *   schema: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     index: Schema.Number
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const parts = Event.EventPartsView(Event.makeKit(step))
 *
 * const named = Schema.decodeUnknownSync(parts)({
 *   _tag: "atif/step",
 *   data: { version: "0.1.0", index: 1 }
 * })
 *
 * Event.isAnyEventPart(named) // => false
 *
 * const unnamed = Schema.decodeUnknownSync(parts)({
 *   _tag: "tokenize/count",
 *   data: { version: "0.1.0", tokens: 3 }
 * })
 *
 * Event.isAnyEventPart(unnamed) // => true
 * ```
 *
 * @see {@link EventParts} for a Schema restricted to the events of the kit.
 * @see {@link AnyEventPart} for the part an unnamed event is read as.
 * @category schemas
 */
export const EventPartsView = <K extends AnyKit>(
  kit: K,
): Schema.Codec<
  EventPartsView<K["events"]>,
  EventPartsViewSchema<K["events"]>["Encoded"],
  EventPartsViewSchema<K["events"]>["DecodingServices"],
  EventPartsViewSchema<K["events"]>["EncodingServices"]
> => {
  const parts: Array<Schema.Top> = [];

  for (const event of Object.values(kit.events)) {
    parts.push(EventPart(event.tag, event.schema));
  }

  parts.push(AnyEventPart);

  // SAFETY: every member is the part of one event of the kit or the part of an
  // event the kit does not name, which is what the return type reads it as.
  return Schema.Union(parts) as any;
};

/**
 * The config of a trajectory whose events are the ones given: the config read,
 * with the events given added to the kit it names.
 *
 * **When to use**
 *
 * Use to name what {@link encode} returns, such as to type a function that reads
 * a trajectory under the events a caller names.
 *
 * **Details**
 *
 * An event kit is what says which events a trajectory may name and how their data
 * is read, so a kit that names the events given is what makes them readable. The
 * events the config given named are kept beside them, as {@link mergeKit} keeps
 * them, and an event given for a tag the kit named states over the one it was read
 * with. What else a trajectory is read with — whether its responses are streamed,
 * its toolkit, its metric kit and its extra kit — is carried over as it was.
 *
 * @see {@link encode} for the function that reads a stream as one.
 * @category models
 */
export type WithEvents<
  Config extends Trajectory.AnyConfig,
  Es extends ReadonlyArray<Any>,
> = Trajectory.Config<
  Config["stream"],
  Config["toolkit"],
  Eventkit<EventsWith<Config, Es>>,
  Config["metrickit"],
  Config["extrakit"]
>;

/** The events a kit names with the events given added to them, which {@link mergeKit} states as one kit over another. */
type EventsWith<Config extends Trajectory.AnyConfig, Es extends ReadonlyArray<Any>> = EventsMerged<
  readonly [Config["eventkit"], Eventkit<EventsByTag<Es>>]
>;

/**
 * The events of a stream read as the events given, as {@link encode} returns it.
 *
 * **When to use**
 *
 * Use to name what {@link encode} returns, such as to pass it on as the reader of
 * a stream, or to type one of the caller's own.
 *
 * **Details**
 *
 * A trajectory is read as a trajectory, so the kit and the variant it carries
 * travel with the parts it returns — with the events given added to the kit, where
 * {@link WithEvents} says — and any other stream of parts is read as a stream of
 * them.
 *
 * @see {@link encode} for the function that returns one.
 * @category models
 */
export type Reader<Es extends ReadonlyArray<Any>> = {
  <Config extends Trajectory.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<Config, E, R>,
  ): Trajectory.Trajectory<WithEvents<Config, Es>, E, R>;
  <Config extends Trajectory.AnyConfig, E, R>(
    stream: Trajectory.TrajectoryStream<Config, E, R>,
  ): Trajectory.TrajectoryStream<WithEvents<Config, Es>, E, R>;
};

/**
 * Reads the event parts of a stream as the events given state them, and names the
 * kit those events make.
 *
 * **When to use**
 *
 * Use when a stream holds events the kit it was read with does not name, or names
 * at a version before the one in hand, and a reader of those events should have
 * them typed and at the newest version: reading a trajectory an extension wrote
 * before a version it states now, or one another kit wrote.
 *
 * **Details**
 *
 * - An event part is read from the pair it was produced as rather than from what
 *   the kit that read the stream made of it, so the tag a part is at alone decides
 *   how it reads, and data of any version of an event reads as the newest one that
 *   event states.
 * - A part at a tag none of the events given names, and a part whose data the event
 *   given does not state — one a newer version wrote, or another extension — is
 *   carried over as the pair it was produced as, rather than failing the stream:
 *   reading a trajectory does not depend on the schemas it is read with.
 * - The trajectory returned names the events given in addition to the ones it named
 *   already, so reading a trajectory does not forget what it was read with. An event
 *   given for a tag the trajectory named — the same event at a newer version, say —
 *   states over the one it was read with.
 * - The function is curried: given the events it returns the function that reads a
 *   stream with them.
 *
 * **Example** (Reading an event produced before the version in hand)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, SchemaGetter, Stream } from "effect"
 * import { Event, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const step = new Event.Event({
 *   package: "atif",
 *   id: "step",
 *   metadata: new Event.Metadata({ name: "Step" }),
 *   schema: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     index: Schema.Number
 *   }).pipe(
 *     VersionedSchema.make,
 *     VersionedSchema.upgrade(
 *       (fields) => ({
 *         ...fields,
 *         version: Schema.Literal("0.1.1"),
 *         tokens: Schema.optional(Schema.Number)
 *       }),
 *       { decode: SchemaGetter.transform((from) => ({ ...from, version: "0.1.1" })) }
 *     )
 *   )
 * })
 *
 * // A part as a kit that names no events reads it: what was produced rather than
 * // data of the event's own type.
 * const produced = Stream.make(
 *   Schema.decodeSync(Trajectory.EventPart(Event.makeKit()))({
 *     _tag: "Event",
 *     event: { _tag: "atif/step", data: { version: "0.1.0", index: 1 } },
 *     timestamp: "2024-01-01T00:00:00.000Z",
 *     sessionId: "session",
 *     uuid: "01890a5d-ac96-774b-bcce-b302099a8057"
 *   })
 * )
 *
 * const parts = await Effect.runPromise(Stream.runCollect(Event.encode(step)(produced)))
 * const [part] = Array.from(parts)
 *
 * part._tag // => "Event"
 * part._tag === "Event" && part.event.data // => { version: "0.1.1", index: 1 }
 * ```
 *
 * @see {@link makeKit} — the kit the events given are collected into.
 * @see {@link EventPartsView} — the codec the events are read with.
 * @category combinators
 */
export function encode<const Es extends ReadonlyArray<Any>>(...events: Es): Reader<Es> {
  const eventkit = makeKit(...events);

  // SAFETY: a kit names the part of each of its events, so the parts of a kit read
  // an event part of any tag — as the event the kit names for that tag, or as the
  // pair produced where it names none or the event states other data — and neither
  // reading nor writing a part takes a service.
  const readAs: Schema.Codec<AnyEventPart, AnyEventPart, never, never> = EventPartsView(
    eventkit,
  ) as any;

  // SAFETY: the overloads of `Reader` say which of the two a caller gets, while
  // the implementation reads either of them the same way: TypeScript relates those
  // signatures to this one the other way round alone.
  return (<Config extends Trajectory.AnyConfig, E, R>(
    stream: Trajectory.TrajectoryStream<Config, E, R> | Trajectory.Trajectory<Config, E, R>,
  ):
    | Trajectory.TrajectoryStream<WithEvents<Config, Es>, E, R>
    | Trajectory.Trajectory<WithEvents<Config, Es>, E, R> => {
    const parts = stream.pipe(
      Stream.map((part): Trajectory.Part<WithEvents<Config, Es>> => {
        if (part._tag !== "Event") {
          return part;
        }

        // SAFETY: an event part is the pair a kit reads, whether the kit that read
        // the stream typed the event it names or left it as it was produced.
        const read = Schema.decodeOption(readAs)(part.event as AnyEventPart);

        // SAFETY: the kit these events make names the events read here, so a part
        // read as one of them is a part of the trajectory that kit names.
        return (Option.isSome(read) ? { ...part, event: read.value } : part) as Trajectory.Part<
          WithEvents<Config, Es>
        >;
      }),
    );

    // A trajectory is a stream that carries the config its parts were produced
    // with, so one that carries an event kit is one this names the events of.
    if (!Predicate.hasProperty(stream, "eventkit")) {
      return parts;
    }

    return Object.assign(parts, {
      stream: stream.stream,
      toolkit: stream.toolkit,
      eventkit: mergeKit(stream.eventkit, eventkit),
      metrickit: stream.metrickit,
      extrakit: stream.extrakit,
    });
  }) as Reader<Es>;
}
