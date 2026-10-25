/**
 * Event declarations collected by tag.
 *
 * {@link make} collects declarations and {@link merge} combines kits.
 * Later declarations replace earlier declarations under the same tag.
 *
 * @stability stable
 */

import type { Schema } from "effect";

import * as Event from "#/Event.ts";
import type { IndexByKey } from "#/internal/types.ts";

type EventsByTag<Es> = IndexByKey<Es, "tag">;

/**
 * A record of {@link Event.Event} declarations keyed by tag.
 *
 * @see {@link make} for construction.
 * @stability stable
 * @category models
 */
export type EventKit<Events extends Record<string, Event.Any>> = Readonly<{
  events: Events;
}>;

/**
 * Collects event declarations under their tags.
 *
 * **Gotchas**
 *
 * The last declaration wins for a repeated tag.
 *
 * @see {@link merge} for combining existing kits.
 * @stability stable
 * @category constructors
 */
export const make = <Es extends ReadonlyArray<Event.Any>>(...events: Es) => {
  // SAFETY: every event given is inserted under its own tag below, so the record
  // holds one event per tag the kit names.
  const output = {} as Record<string, Event.Any>;

  for (const event of events) {
    output[event.tag] = event;
  }

  // SAFETY: `output` holds the event of every tag in `Es`.
  // `EventsByTag` reads the events given as that record.
  return { events: output } as EventKit<EventsByTag<Es>>;
};

/**
 * An {@link EventKit} without specific event types.
 *
 * @stability stable
 * @category utility types
 */
export type Any = EventKit<Record<string, Event.Any>>;

/**
 * An event kit with no declarations.
 *
 * @see {@link make} for a kit with declarations.
 * @stability stable
 * @category constants
 */
export const empty = make();

/**
 * The type of the declaration-free {@link empty} kit.
 *
 * @stability stable
 * @category utility types
 */
export type Empty = typeof empty;

/**
 * Event declarations of an {@link EventKit}, or `never` for another type.
 *
 * @see {@link Event.EventParts} for the corresponding tagged payloads.
 * @stability stable
 * @category utility types
 */
export type Events<K> = K extends EventKit<infer Events> ? Events : never;

/**
 * Schema requirements for decoding the events of an {@link EventKit}.
 *
 * @see {@link EncodingServices} for writing the same events.
 * @stability stable
 * @category utility types
 */
export type DecodingServices<K extends Any> = Schema.Codec.DecodingServices<
  K["events"][keyof K["events"]]["schema"]
>;

/**
 * Schema requirements for encoding the events of an {@link EventKit}.
 *
 * @see {@link DecodingServices} for reading the same events.
 * @stability stable
 * @category utility types
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

/**
 * The {@link EventKit} produced by merging kits in tuple order.
 *
 * @see {@link merge} for duplicate-tag behavior.
 * @stability stable
 * @category utility types
 */
export type Merged<Ks extends ReadonlyArray<Any>> = EventKit<EventsMerged<Ks>>;

/**
 * Combines the declarations of existing event kits.
 *
 * **Gotchas**
 *
 * The last kit wins for a repeated tag.
 * Declarations are replaced, not combined.
 *
 * @see {@link make} for collecting individual declarations.
 * @stability stable
 * @category combining
 */
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
