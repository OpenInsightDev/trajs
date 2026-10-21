/**
 * Events an extension produces of a trajectory, and the parts a trajectory holds
 * them as.
 *
 * An {@link Event} names one kind of event with the schema of its data at every
 * version, {@link EventKit.make} and {@link EventKit.merge} collect events into
 * kits, {@link EventParts} reads a trajectory's event parts under a kit, and
 * {@link encode} reads a stream under events the caller names.
 */

import { Data, Option, Predicate, Schema, Stream } from "effect";

import * as EventKit from "#/EventKit.ts";
import { attach } from "#/internal/trajectory.ts";
import type * as Trajectory from "#/Trajectory.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/**
 * Describes an event: an optional name and description.
 *
 * @see {@link Event} for the event it describes.
 * @category models
 */
export class Metadata extends Schema.Class<Metadata>("Metadata")({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

/**
 * One kind of event an extension names.
 *
 * **When to use**
 *
 * Use to declare an event an extension produces, or to type one.
 *
 * **Details**
 *
 * `package` and `id` name it — `tag` is `"pkg/id"` — and `schema` is its data at every
 * version it was written at ({@link VersionedSchema.VersionedSchema}). Collect events
 * into a kit with {@link EventKit.make}.
 *
 * @see {@link EventKit.make} for collecting events into a kit.
 * @see {@link EventParts} for reading a trajectory's event parts.
 * @category models
 */
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

/** An event whose package, id and data versions are not known. */
export type Any = Event<string, string, VersionedSchema.Any>;

/** An event part: its data under the tag it was produced with. */
export type EventPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

/**
 * Builds the part schema of one event: its data, under `tag`.
 *
 * **When to use**
 *
 * Use to build a part schema for a single tag; {@link EventParts} builds the union
 * over every event of a kit.
 *
 * **Details**
 *
 * The part read is a tagged struct whose `data` is the schema given.
 *
 * @see {@link EventParts} for the parts of a whole kit.
 * @category schemas
 */
export const EventPart = <Tag extends string, S extends Schema.Top>(
  tag: Tag,
  schema: S,
): Schema.TaggedStruct<Tag, { readonly data: S }> => Schema.TaggedStruct(tag, { data: schema });

/** The part schema of one event: its data, under the tag that event names. */
type EventPartSchema<Ext> = Ext extends Any
  ? Schema.TaggedStruct<Ext["tag"], { readonly data: Ext["schema"] }>
  : never;

/** The part schemas the events of the events given state, as one. */
type EventPartSchemas<Events extends Record<string, Any>> = EventPartSchema<Events[keyof Events]>;

/** The part one event is held as: its data, under the tag that event names. */
type EventPartOf<Ext> = Ext extends Any
  ? EventPart<Ext["tag"], Schema.Schema.Type<Ext["schema"]>>
  : never;

/**
 * What a trajectory holds of the events of a kit.
 *
 * **When to use**
 *
 * Use to type an event part, such as one a run enqueues or one a trajectory holds.
 *
 * **Details**
 *
 * A part is the tag it was produced under and the data at that tag. Since the data
 * does not say which event it is of, a part reads as the event of the reading kit
 * that names its tag and no other: an event the kit does not name is one the reading
 * holds no schema of.
 *
 * @see {@link EventParts} for the schema that reads one.
 * @category models
 */
export type EventParts<Events extends Record<string, Any>> = EventPartOf<Events[keyof Events]>;

/**
 * The parts a trajectory holds of the events of a kit, as one schema.
 *
 * **When to use**
 *
 * Use to read or write the event parts of a trajectory under the kit that says what
 * they are.
 *
 * **Details**
 *
 * - Every event of the kit is a member of the union, read under its own tag by the
 *   event's data at the version the part was written at.
 * - A part of any other event reads as no member: a tag means the schema of the
 *   event that names it, so a reading covers only the events of the kits in hand.
 * - A kit that names no event reads no part.
 *
 * **Example** (Reading the event parts a kit names)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Event, EventKit, VersionedSchema } from "@trajs/core"
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
 * const parts = Event.EventParts(EventKit.make(step))
 *
 * const read = Schema.decodeUnknownSync(parts)({
 *   _tag: "atif/step",
 *   data: { version: "0.1.0", index: 1 }
 * })
 *
 * read.data // => { version: "0.1.0", index: 1 }
 *
 * // An event the kit does not name is not a part it reads.
 * Schema.is(parts)({
 *   _tag: "tokenize/count",
 *   data: { version: "0.1.0", tokens: 3 }
 * }) // => false
 * ```
 *
 * @see {@link EventParts} for what a part is.
 * @category schemas
 */
export const EventParts = <K extends EventKit.Any>(
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
 * The config of a trajectory whose events are the ones given: the config read, with
 * the events given added to the kit it names.
 *
 * **When to use**
 *
 * Use to type what {@link encode} returns.
 *
 * **Details**
 *
 * The events the config named are kept beside the events given, as {@link EventKit.merge}
 * keeps them, and an event given for a tag the config named states over the one it
 * was read with. What else the trajectory is read with — whether its responses are
 * streamed, its toolkit, its metric kit and its extra kit — is carried over as it
 * was.
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
  EventsWith<Config, Es>,
  Config["metrickit"],
  Config["extrakit"]
>;

/** The kit a config's events make with the events given added, which {@link EventKit.merge} states as one kit over another. */
type EventsWith<
  Config extends Trajectory.AnyConfig,
  Es extends ReadonlyArray<Any>,
> = EventKit.Merged<readonly [Config["eventkit"], ReturnType<typeof EventKit.make<Es>>]>;

/**
 * The events of a stream read as the events given, as {@link encode} returns it.
 *
 * **When to use**
 *
 * Use to pass a reader on, or to type one of the caller's own.
 *
 * **Details**
 *
 * A trajectory is read as a trajectory, so its kit and variant travel with the
 * returned parts — with the events given added to the kit, as {@link WithEvents}
 * says — while any other stream of parts is read as a stream of parts.
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
 * Use when a stream holds an event at a version before the one in hand and a reader of
 * it should have that event typed at the newest version.
 *
 * **Details**
 *
 * - An event part is read from the tag it is at and the data stated there, so the
 *   tag alone decides how it reads, and data at any version reads as the newest
 *   version the event states.
 * - A part at a tag none of the events names, or whose data the event does not
 *   state — one a newer version wrote, or another extension — is carried over as the
 *   trajectory holds it rather than failing the stream: reading a trajectory does not
 *   depend on the schemas it is read with.
 * - The returned trajectory names the events given in addition to the ones it named
 *   already; an event given for a tag it named states over the one it was read with.
 * - The function is curried: given the events it returns the function that reads a
 *   stream with them.
 *
 * **Example** (Reading an event produced before the version in hand)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, SchemaGetter, Stream } from "effect"
 * import { Event, EventKit, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const first = Schema.Struct({
 *   version: Schema.Literal("0.1.0"),
 *   index: Schema.Number
 * }).pipe(VersionedSchema.make)
 *
 * // The event as the trajectory was written with it: the version before alone.
 * const before = new Event.Event({
 *   package: "atif",
 *   id: "step",
 *   metadata: new Event.Metadata({ name: "Step" }),
 *   schema: first
 * })
 *
 * // The event as the extension states it now: the version next, and how the version
 * // before reads as that one.
 * const step = new Event.Event({
 *   package: "atif",
 *   id: "step",
 *   metadata: new Event.Metadata({ name: "Step" }),
 *   schema: first.pipe(
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
 * // What the trajectory holds: the part read by the kit it was written with, so the
 * // data is at the version the trajectory states rather than at the one in hand.
 * const written = Stream.make(
 *   Schema.decodeSync(Trajectory.EventPart(EventKit.make(before)))({
 *     _tag: "Event",
 *     event: { _tag: "atif/step", data: { version: "0.1.0", index: 1 } },
 *     timestamp: "2024-01-01T00:00:00.000Z",
 *     sessionId: "session",
 *     uuid: "01890a5d-ac96-774b-bcce-b302099a8057"
 *   })
 * )
 *
 * const parts = await Effect.runPromise(Stream.runCollect(Event.encode(step)(written)))
 * const [part] = Array.from(parts)
 *
 * part._tag // => "Event"
 * part._tag === "Event" && part.event.data // => { version: "0.1.1", index: 1 }
 * ```
 *
 * @see {@link EventKit.make} — the kit the events given are collected into.
 * @see {@link EventParts} — the codec the events are read with.
 * @category combinators
 */
export function encode<const Es extends ReadonlyArray<Any>>(...events: Es): Reader<Es> {
  const eventkit = EventKit.make(...events);

  // SAFETY: the kit the events given make names the part of each of them, so it reads
  // an event part of any tag — as the event that kit names for that tag, and as nothing
  // where it names none — and neither reading nor writing one takes a service.
  const readAs: Schema.Codec<
    EventPart<string, unknown>,
    EventPart<string, unknown>,
    never,
    never
  > = EventParts(eventkit) as any;

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

        // SAFETY: an event part is the pair the kit that read the stream made of it —
        // the tag of an event and the data stated at it — which is what the union of
        // the events given reads.
        const read = Schema.decodeOption(readAs)(part.event);

        // SAFETY: the kit these events make names the events read here, so a part
        // read as one of them is a part of the trajectory that kit names; a part none
        // of them reads is carried over as it is.
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

    return attach({
      stream: stream.stream,
      toolkit: stream.toolkit,
      eventkit: EventKit.merge(stream.eventkit, eventkit),
      metrickit: stream.metrickit,
      extrakit: stream.extrakit,
    })(parts);
  }) as Reader<Es>;
}
