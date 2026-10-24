import type { Schema } from "effect";

import * as Event from "#/Event.ts";
import type { IndexByKey } from "#/internal/types.ts";

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
