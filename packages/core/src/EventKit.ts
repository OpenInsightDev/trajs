/**
 * Events collected into a kit: what a reading of a trajectory names, keyed by the tag
 * each event is produced under.
 *
 * {@link make} collects the events an extension declares ({@link Event.Event}) into a
 * kit, {@link merge} adds the events of one kit to another's, and {@link empty} names
 * none. A kit is what a trajectory is read with — the `eventkit` of its
 * {@link Trajectory.Config} — so the events a reading knows are the events its kit
 * names and no others.
 *
 * {@link Event.EventParts} reads a trajectory's event parts under a kit, and
 * {@link Event.encode} reads a stream of parts under the events given, naming the kit
 * they make.
 */

import type * as Event from "#/Event.ts";
import type { IndexByKey } from "#/internal/types.ts";

/** The events of the events given, keyed by the tag each names. */
type EventsByTag<Es> = IndexByKey<Es, "tag">;

/**
 * A kit of events, keyed by the tag each names.
 *
 * **When to use**
 *
 * Use to name the events a trajectory is read with — a field of a config, or the
 * parameter of a function that reads parts under one.
 *
 * @see {@link make} for building one, {@link Event.EventParts} for reading it.
 * @category models
 */
export type Kit<Events extends Record<string, Event.Any>> = Readonly<{
  events: Events;
}>;

/**
 * Collects events into a kit, keyed by the tag each names.
 *
 * **When to use**
 *
 * Use to gather the events an extension produces into the kit a trajectory is read
 * with.
 *
 * **Details**
 *
 * Each event is keyed by its own `tag`, so a kit names one event per tag. A kit names
 * the events it was given and no others; {@link empty} names none.
 *
 * @see {@link merge} for adding the events of one kit to another's.
 * @see {@link Event.EventParts} for reading a trajectory's event parts under a kit.
 * @category constructors
 */
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

/**
 * A kit whose events are not known.
 *
 * @category models
 */
export type Any = Kit<Record<string, Event.Any>>;

/**
 * A kit that declares no event.
 *
 * @category constants
 */
export const empty = make();

/**
 * The type of {@link empty}.
 *
 * @category utility types
 */
export type Empty = typeof empty;

/** The events of the kits given as one, a shared tag holding the event of the latest kit that names it. */
type EventsMerged<Ks extends ReadonlyArray<Any>> = Ks extends readonly [
  infer Head extends Any,
  ...infer Tail extends ReadonlyArray<Any>,
]
  ? Omit<Head["events"], keyof EventsMerged<Tail>> & EventsMerged<Tail>
  : {};

/**
 * The kit the kits given make, as one: every event they name, a shared tag holding
 * the event of the latest kit that names it.
 *
 * **When to use**
 *
 * Use to type the kit {@link merge} returns.
 *
 * @see {@link merge} for the kit it types.
 * @category models
 */
export type Merged<Ks extends ReadonlyArray<Any>> = Kit<EventsMerged<Ks>>;

/**
 * Adds the events of each kit given to the ones of the kits before it.
 *
 * **When to use**
 *
 * Use when the events of several extensions are read together, or when a reader
 * that knows some of a trajectory's events reads it under the ones it knows without
 * forgetting the rest.
 *
 * **Details**
 *
 * A shared tag holds the event of the latest kit that names it, so a kit of a
 * version an extension states now states over the one a trajectory was read with.
 *
 * **Example** (Adding the events of one kit to another's)
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
 * const merged = EventKit.merge(EventKit.make(step), EventKit.make(count))
 * Object.keys(merged.events) // => ["atif/step", "tokenize/count"]
 * ```
 *
 * @see {@link make} for a kit of the events given alone.
 * @see {@link Event.encode} — the reader that adds events to the kit of a trajectory.
 * @category constructors
 */
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
