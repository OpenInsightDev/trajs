import type { Schema } from "effect";

import * as Event from "#/Event.ts";
import type { IndexByKey } from "#/internal/types.ts";

type EventsByTag<Es> = IndexByKey<Es, "tag">;

export type Eventkit<Events extends Record<string, Event.Any>> = Readonly<{
  events: Events;
}>;

export const make = <Es extends ReadonlyArray<Event.Any>>(...events: Es) => {
  // SAFETY: every event given is inserted under its own tag below, so the record
  // holds one event per tag the kit names.
  const output = {} as Record<string, Event.Any>;

  for (const event of events) {
    output[event.tag] = event;
  }

  // SAFETY: `output` holds the event of every tag in `Es`.
  // `EventsByTag` reads the events given as that record.
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
  // SAFETY: every event of every kit is inserted under its own tag below, so the
  // record holds one event per tag the kits name.
  const events = {} as Record<string, Event.Any>;

  for (const kit of kits) {
    Object.assign(events, kit.events);
  }

  // SAFETY: `events` holds one event per tag in `Ks`.
  // Where several kits name one tag, the latest kit keeps its event.
  // `EventsMerged` reads the kits as that record.
  return { events } as Merged<Ks>;
};
