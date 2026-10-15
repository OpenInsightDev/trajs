/**
 * The events ATIF's own conventions are recorded as.
 *
 * ATIF records what happens of a run, rather than what is said, as system steps,
 * and states what some of them do as a convention of its own. The one ATIF v1.8
 * defines is context management: a system step that transforms the agent's
 * context window declares a `context_management` object saying what the
 * transformation was and how it bounds the steps after it. This module declares
 * the event the package records that convention as and collects it into the kit
 * the package records with, so a run that transforms its context records it among
 * the events of its trajectory rather than in a field beside it, and the package
 * entry re-exports this module directly, so what it declares is what the package
 * offers beside {@link Step.Step}.
 *
 * An event is named by the package that declares it: the `package` of its tag is
 * the `name` of this package, so what a recording states of an event is the
 * package that wrote it rather than a name the package made up. Nothing of a
 * recording is derived from an event — transforming a context is something a run
 * does rather than something a kit reads off the parts — so each is declared with
 * a schema alone, and the one an event records is read back with the kit the
 * events are collected into, {@link eventkit}.
 */

import { Event, VersionedSchema } from "@trajs/core";
import { Schema } from "effect";

import pkg from "../package.json" with { type: "json" };

/** The kinds of context transformation ATIF names for a `type`. */
const types = ["compaction", "pruning", "injection"] as const;

/** The kinds of context boundary ATIF names for a `boundary`. */
const boundaries = ["replace", "append", "truncate"] as const;

/**
 * The kind of transformation a context management event states.
 *
 * **When to use**
 *
 * Use when building a context management event, or when reading what one states.
 *
 * **Details**
 *
 * The values are the ones ATIF v1.8 names:
 *
 * - `compaction` — the prior context was compressed into a summary.
 * - `pruning` — older turns were removed from the context.
 * - `injection` — external knowledge was added to the context.
 *
 * ATIF leaves the set open to a producer, so a recording may state a kind beyond
 * these three; one is read by a version of this event's schema that names it, and
 * not by the version declared here.
 *
 * @see {@link ContextManagementBoundary} for how the transformation bounds the steps after it.
 * @category models
 */
export type ContextManagementType = (typeof types)[number];

/**
 * How a context management event bounds the agent's context for the steps after
 * it.
 *
 * **When to use**
 *
 * Use when building a context management event, or when reading what one states,
 * such as to reconstruct the context a later step was given.
 *
 * **Details**
 *
 * The values are the ones ATIF v1.8 names:
 *
 * - `replace` — the content the transformation produced replaces every prior
 *   context, so a step after the event is read with that content and the steps
 *   after it rather than with the steps before it.
 * - `append` — that content is added to the context the steps before it left.
 * - `truncate` — the prior context was trimmed.
 *
 * The event states which of them happened rather than the context that results:
 * the content a `replace` bound leaves is what the steps around the event carry,
 * which ATIF records as an observation and a recording holds as the messages of
 * the conversation.
 *
 * @see {@link ContextManagementType} for what the transformation was.
 * @category models
 */
export type ContextManagementBoundary = (typeof boundaries)[number];

/**
 * The event the package records ATIF's context management convention as.
 *
 * **When to use**
 *
 * Use as an entry of the kit a recording that transforms its context is written
 * or read with — {@link eventkit} — or to read the metadata of the event and the
 * tag it is recorded under.
 *
 * **Details**
 *
 * `package` is the `name` of this package as `package.json` states it, and `id`
 * names the event within the package, so the tag the event is recorded under is
 * the package's own name followed by `ContextManagement`: what a recording states
 * of an event is the package that wrote it rather than a name the package made
 * up. `metadata` describes the event itself, and `schema` is the data of one
 * event at every version it was written at, which here is the single version
 * `1.8`.
 *
 * @see {@link eventkit} for the kit the event is an entry of.
 * @see {@link contextManagement} for the data of one event.
 * @category constants
 */
export const contextManagementEvent = new Event.Event({
  package: pkg.name,
  id: "ContextManagement",
  metadata: new Event.Metadata({
    name: "Context management",
    description: "What ATIF states of a system step that transformed the agent's context.",
  }),
  schema: Schema.Struct({
    /**
     * ATIF RFC version that defines the convention this event conforms to.
     */
    version: Schema.Literal("1.8"),
    /**
     * Kind of transformation the run performed.
     */
    type: Schema.Literals(types),
    /**
     * How the transformation bounds the agent's context for the steps after it.
     */
    boundary: Schema.Literals(boundaries),
  }).pipe(VersionedSchema.make),
});

/**
 * The context management event at the newest version of the event's data.
 *
 * **When to use**
 *
 * Use when building the datum a context management event carries, or when reading
 * one that was recorded at the newest version. A recording may hold a datum of an
 * older version, so read one through the event's schema — {@link contextManagementEvent}
 * — rather than with this shape alone.
 *
 * **Details**
 *
 * - `version` is the ATIF RFC version that defines the convention, so the version
 *   tracks ATIF rather than this package.
 * - `type` is what the transformation was — see {@link ContextManagementType}.
 * - `boundary` is how it bounds the steps after it — see
 *   {@link ContextManagementBoundary}.
 *
 * The event is what ATIF records of a system step that transformed the context,
 * and states what the run did rather than the context it left: what a `replace`
 * bound leaves is read off the steps around the event, not off this shape.
 *
 * @see {@link contextManagementEvent} for the event the shape is declared by.
 * @category schemas
 */
export const ContextManagement = contextManagementEvent.schema.self;

/**
 * A context management event as the package records it, at the newest version of
 * the event's data.
 *
 * @see {@link contextManagementEvent} for the event the datum belongs to.
 * @category models
 */
export type ContextManagement = Schema.Schema.Type<typeof ContextManagement>;

/**
 * Records an event that transformed the agent's context.
 *
 * **When to use**
 *
 * Use where a run transforms the context of a session — compresses it, prunes it,
 * or adds knowledge to it — so the transformation stands at the point it happened
 * and a reader can tell where the agent's context was bounded.
 *
 * **Details**
 *
 * What is returned is what a session records of the event: the tag it is recorded
 * under together with the context management datum, which is what a session's
 * stream carries. `Produce.ProduceSession.enqueueEvent` records one as an event
 * part of the trajectory where it happened.
 *
 * A run transforms its context by acting on the conversation, so the event states
 * the transformation rather than the context it left: what a `replace` bound
 * leaves is read off the messages the session recorded after the event.
 *
 * **Example** (Stating that the agent's context was replaced)
 *
 * ```ts import.meta.vitest
 * import { contextManagement } from "@trajs/extension-atif"
 *
 * const event = contextManagement({ type: "compaction", boundary: "replace" })
 * event.data.boundary // => "replace"
 * ```
 *
 * @see {@link eventkit} for the kit the event is read with.
 * @see {@link ContextManagementBoundary} for how a bound is read.
 * @category constructors
 */
export const contextManagement = (
  event: Omit<ContextManagement, "version">,
): Event.EventParts<(typeof eventkit)["events"]> => ({
  _tag: contextManagementEvent.tag,
  data: ContextManagement.make({
    ...event,
    version: ContextManagement.fields.version.literal,
  }),
});

/**
 * The events this package records with, collected into a kit.
 *
 * **When to use**
 *
 * Use as the events of the kit a recording is written or read with — the
 * `eventkit` of the run that records it — so that the events this package records
 * are read back by it rather than as the JSON they were recorded as.
 *
 * **Details**
 *
 * The kit is an `Eventkit` of every event this package declares, each held under
 * the tag it is recorded under — here {@link contextManagementEvent}, the one
 * event the package declares so far. It is extended rather than replaced when
 * other packages' events are recorded with the same trajectory, and it is what a
 * reader installs to get the events back with their types.
 *
 * @see {@link contextManagementEvent} for the event it holds.
 * @category constants
 */
export const eventkit = Event.makeKit(contextManagementEvent);
