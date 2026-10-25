/**
 * The events ATIF's own conventions are produced as.
 *
 * ATIF v1.8 defines one: a system step that transforms the agent's context declares a
 * `context_management` object. The module produces that convention as an event, so a
 * run that transforms its context produces it among the events of its trajectory.
 */

import { Schema } from "effect";

import { packageName } from "#/atif/internal/package.ts";
import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/** The kinds of context transformation ATIF names for a `type`. */
const types = ["compaction", "pruning", "injection"] as const;

/** The kinds of context boundary ATIF names for a `boundary`. */
const boundaries = ["replace", "append", "truncate"] as const;

/**
 * The kind of transformation a context management event states.
 *
 * ATIF RFC 0001 v1.8, Section VII "Context Management Convention".
 *
 * ATIF leaves the set open to a producer, so a document may state a kind beyond
 * `compaction`, `pruning` and `injection`.
 *
 * @category models
 */
export type ContextManagementType = (typeof types)[number];

/**
 * How a context management event bounds the agent's context for the steps after it.
 *
 * ATIF RFC 0001 v1.8, Section VII "Context Management Convention".
 *
 * @category models
 */
export type ContextManagementBoundary = (typeof boundaries)[number];

/**
 * The event the module produces ATIF's context management convention as.
 *
 * @category constants
 */
export const contextManagementEvent = new Event.Event({
  package: packageName,
  id: "ContextManagement",
  metadata: new Event.Metadata({
    name: "Context management",
    description: "What ATIF states of a system step that transformed the agent's context.",
  }),
  schema: Schema.Struct({
    /** The ATIF RFC version that defines the convention this event conforms to. */
    version: Schema.Literal("1.8"),
    /** The kind of transformation the run performed. */
    type: Schema.Literals(types),
    /** How the transformation bounds the agent's context for the steps after it. */
    boundary: Schema.Literals(boundaries),
  }).pipe(VersionedSchema.make),
});

/**
 * The context management event at the newest version of the event's data.
 *
 * ATIF RFC 0001 v1.8, Section VII "Context Management Convention".
 *
 * @category schemas
 */
export const ContextManagement = contextManagementEvent.schema.self;

/**
 * A context management event as the module produces it, at the newest version of
 * the event's data.
 *
 * @category models
 */
export type ContextManagement = Schema.Schema.Type<typeof ContextManagement>;

/**
 * Produces an event that transformed the agent's context.
 *
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
 * The events this module produces with, collected into a kit.
 *
 * @category constants
 */
export const eventkit = EventKit.make(contextManagementEvent);
