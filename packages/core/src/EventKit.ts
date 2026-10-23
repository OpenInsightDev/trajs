import { Option, Predicate, Schema, Stream } from "effect";

import type * as Config from "#/Config.ts";
import * as Event from "#/Event.ts";
import { attach } from "#/internal/trajectory.ts";
import type { IndexByKey } from "#/internal/types.ts";
import type * as Trajectory from "#/Trajectory.ts";

type EventsByTag<Es> = IndexByKey<Es, "tag">;

export type Eventkit<Events extends Record<string, Event.Any>> = Readonly<{
  events: Events;
}>;

export const make = <Es extends ReadonlyArray<Event.Any>>(...events: Es) => {
  const output = {} as Record<string, Event.Any>;

  for (const event of events) {
    output[event.tag] = event;
  }

  return { events: output } as Eventkit<EventsByTag<Es>>;
};

export type Any = Eventkit<Record<string, Event.Any>>;

export const empty = make();

export type Empty = typeof empty;

/**
 * A utility type which extracts the events from an {@link Eventkit}.
 *
 * @see {@link Event.EventParts} for the part schema those events make
 * @category models
 */
export type Events<K> = K extends Eventkit<infer Events> ? Events : never;

/**
 * The services that decoding the event schemas of a {@link Eventkit} requires.
 *
 * @see {@link EncodingServices} for the services of writing the same schemas
 * @category models
 */
export type DecodingServices<K extends Any> = Schema.Codec.DecodingServices<
  K["events"][keyof K["events"]]["schema"]
>;

/**
 * The services that encoding the event schemas of a {@link Eventkit} requires.
 *
 * @see {@link DecodingServices} for the services of reading the same schemas
 * @category models
 */
export type EncodingServices<K extends Any> = Schema.Codec.EncodingServices<
  K["events"][keyof K["events"]]["schema"]
>;

type EventsMerged<Ks extends ReadonlyArray<Any>> = Ks extends readonly [
  infer Head extends Any,
  ...infer Tail extends ReadonlyArray<Any>,
]
  ? Omit<Head["events"], keyof EventsMerged<Tail>> & EventsMerged<Tail>
  : {};

export type Merged<Ks extends ReadonlyArray<Any>> = Eventkit<EventsMerged<Ks>>;

export const merge = <Ks extends ReadonlyArray<Any>>(...kits: Ks): Merged<Ks> => {
  const events = {} as Record<string, Event.Any>;

  for (const kit of kits) {
    Object.assign(events, kit.events);
  }

  return { events } as Merged<Ks>;
};

type WithEvents<Config extends Config.AnyConfig, K extends Any> = Config.Config<
  Config["stream"],
  Config["toolkit"],
  Merged<readonly [Config["eventkit"], K]>,
  Config["metrickit"],
  Config["extrakit"]
>;

type Reader<K extends Any> = {
  <Id extends string, Config extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<Id, Config, E, R>,
  ): Trajectory.Trajectory<Id, WithEvents<Config, K>, E, R>;
  <Config extends Config.AnyConfig, E, R>(
    stream: Trajectory.TrajectoryStream<Config, E, R>,
  ): Trajectory.TrajectoryStream<WithEvents<Config, K>, E, R>;
};

export const encode = <K extends Any>(kit: K): Reader<K> => {
  // SAFETY: the kit names the part of each of its events, so it reads an event
  // part of any tag as the event it names there, and as nothing where it names none.
  const readAs: Schema.Codec<
    Event.EventPart<string, unknown>,
    Event.EventPart<string, unknown>,
    never,
    never
  > = Event.EventParts(kit) as any;

  // SAFETY: the overloads of `Reader` say which of the two a caller gets, while
  // the implementation reads either of them the same way.
  return (<Config extends Config.AnyConfig, E, R>(
    stream: Trajectory.TrajectoryStream<Config, E, R> | Trajectory.Trajectory<string, Config, E, R>,
  ):
    | Trajectory.TrajectoryStream<WithEvents<Config, K>, E, R>
    | Trajectory.Trajectory<string, WithEvents<Config, K>, E, R> => {
    const parts = stream.pipe(
      Stream.map((part): Trajectory.Part<WithEvents<Config, K>> => {
        if (part._tag !== "Event") {
          return part;
        }

        // SAFETY: an event part is the tag of an event and the data stated at it,
        // which is what the union of the kit's events reads.
        const read = Schema.decodeOption(readAs)(part.event);

        // SAFETY: the kit names the events read here, so a part read as one of
        // them is a part of the trajectory that kit names; a part none of them
        // reads is carried over as it is.
        return (Option.isSome(read) ? { ...part, event: read.value } : part) as Trajectory.Part<
          WithEvents<Config, K>
        >;
      }),
    );

    if (!Predicate.hasProperty(stream, "eventkit")) {
      return parts;
    }

    return attach(stream.id, {
      stream: stream.stream,
      toolkit: stream.toolkit,
      eventkit: merge(stream.eventkit, kit),
      metrickit: stream.metrickit,
      extrakit: stream.extrakit,
    })(parts);
  }) as Reader<K>;
};
