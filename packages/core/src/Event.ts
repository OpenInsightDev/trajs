import { Data, Option, Predicate, Schema, Stream } from "effect";

import * as EventKit from "#/EventKit.ts";
import { attach } from "#/internal/trajectory.ts";
import type * as Trajectory from "#/Trajectory.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

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

export type EventPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

export const EventPart = <Tag extends string, S extends Schema.Top>(
  tag: Tag,
  schema: S,
): Schema.TaggedStruct<Tag, { readonly data: S }> => Schema.TaggedStruct(tag, { data: schema });

type EventPartSchema<Ext> = Ext extends Any
  ? Schema.TaggedStruct<Ext["tag"], { readonly data: Ext["schema"] }>
  : never;

type EventPartSchemas<Events extends Record<string, Any>> = EventPartSchema<Events[keyof Events]>;

type EventPartOf<Ext> = Ext extends Any
  ? EventPart<Ext["tag"], Schema.Schema.Type<Ext["schema"]>>
  : never;

export type EventParts<Events extends Record<string, Any>> = EventPartOf<Events[keyof Events]>;

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

type EventsWith<
  Config extends Trajectory.AnyConfig,
  Es extends ReadonlyArray<Any>,
> = EventKit.Merged<readonly [Config["eventkit"], ReturnType<typeof EventKit.make<Es>>]>;

export type Reader<Es extends ReadonlyArray<Any>> = {
  <Id extends string, Config extends Trajectory.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<Id, Config, E, R>,
  ): Trajectory.Trajectory<Id, WithEvents<Config, Es>, E, R>;
  <Config extends Trajectory.AnyConfig, E, R>(
    stream: Trajectory.TrajectoryStream<Config, E, R>,
  ): Trajectory.TrajectoryStream<WithEvents<Config, Es>, E, R>;
};

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
    stream: Trajectory.TrajectoryStream<Config, E, R> | Trajectory.Trajectory<string, Config, E, R>,
  ):
    | Trajectory.TrajectoryStream<WithEvents<Config, Es>, E, R>
    | Trajectory.Trajectory<string, WithEvents<Config, Es>, E, R> => {
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

    return attach(stream.id, {
      stream: stream.stream,
      toolkit: stream.toolkit,
      eventkit: EventKit.merge(stream.eventkit, eventkit),
      metrickit: stream.metrickit,
      extrakit: stream.extrakit,
    })(parts);
  }) as Reader<Es>;
}
