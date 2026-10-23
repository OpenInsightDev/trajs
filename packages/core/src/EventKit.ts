import type * as Event from "#/Event.ts";
import type { IndexByKey } from "#/internal/types.ts";

type EventsByTag<Es> = IndexByKey<Es, "tag">;

export type Kit<Events extends Record<string, Event.Any>> = Readonly<{
  events: Events;
}>;

export const make = <Es extends ReadonlyArray<Event.Any>>(...events: Es) => {
  // SAFETY: every event given is inserted under its own tag below, so what the record
  // holds is one event per tag the kit names.
  const output = {} as Record<string, Event.Any>;

  for (const event of events) {
    output[event.tag] = event;
  }

  // SAFETY: `output` holds the event of every tag in `Es`, which is what `EventsByTag`
  // reads the events given as.
  return { events: output } as Kit<EventsByTag<Es>>;
};

export type Any = Kit<Record<string, Event.Any>>;

export const empty = make();

export type Empty = typeof empty;

type EventsMerged<Ks extends ReadonlyArray<Any>> = Ks extends readonly [
  infer Head extends Any,
  ...infer Tail extends ReadonlyArray<Any>,
]
  ? Omit<Head["events"], keyof EventsMerged<Tail>> & EventsMerged<Tail>
  : {};

export type Merged<Ks extends ReadonlyArray<Any>> = Kit<EventsMerged<Ks>>;

export const merge = <Ks extends ReadonlyArray<Any>>(...kits: Ks): Merged<Ks> => {
  // SAFETY: every event of every kit is inserted under its own tag below, so what
  // the record holds is one event per tag the kits name.
  const events = {} as Record<string, Event.Any>;

  for (const kit of kits) {
    Object.assign(events, kit.events);
  }

  // SAFETY: `events` holds the event of every tag in `Ks`, the one of the kit latest
  // among those that names it, which is what `EventsMerged` reads the kits as.
  return { events } as Merged<Ks>;
};
