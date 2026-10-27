/**
 * Event declarations for ATIF context-management conventions.
 *
 * {@link contextManagement} constructs a tagged payload for a context transformation.
 * {@link eventkit} supplies its declaration for trajectory decoding.
 *
 * @stability stable
 */

import { Schema } from "effect";

import * as Event from "#/Event.ts";
import * as EventKit from "#/EventKit.ts";
import { packageMetadata, packageName } from "#/unstable/atif/internal/package.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/** The kinds of context transformation ATIF names for a `type`. */
const types = ["compaction", "pruning", "injection"] as const;

/** The kinds of context boundary ATIF names for a `boundary`. */
const boundaries = ["replace", "append", "truncate"] as const;

/**
 * The context transformations supported by this ATIF event declaration.
 *
 * **Gotchas**
 *
 * ATIF permits producer-defined kinds, but this declaration accepts only the listed literals.
 *
 * @see {@link ContextManagement} for the payload schema.
 * @stability stable
 * @category models
 */
export type ContextManagementType = (typeof types)[number];

/**
 * The context-boundary operations supported by the event declaration.
 *
 * @see {@link ContextManagement} for the payload schema.
 * @stability stable
 * @category models
 */
export type ContextManagementBoundary = (typeof boundaries)[number];

/**
 * Event declaration for ATIF v1.8 context transformations.
 *
 * **Gotchas**
 *
 * Importing an ATIF document does not automatically produce these events.
 *
 * @see {@link contextManagement} for constructing a payload.
 * @see {@link ContextManagement} for the current data schema.
 * @stability stable
 * @category constants
 */
export const contextManagementEvent = new Event.Event({
  packageName,
  id: "ContextManagement",
  metadata: new Event.Metadata({
    name: "Context management",
    description: "What ATIF states of a system step that transformed the agent's context.",
  }),
  packageMetadata,
  schema: Schema.Struct({
    version: Schema.Literal("1.8"),
    type: Schema.Literals(types),
    boundary: Schema.Literals(boundaries),
  }).pipe(VersionedSchema.make),
});

/**
 * Schema for current context-management data at version `"1.8"`.
 *
 * @see {@link contextManagementEvent} for the versioned declaration.
 * @stability stable
 * @category schemas
 */
export const ContextManagement = contextManagementEvent.schema.self;

/**
 * Current decoded context-management data without the event tag.
 *
 * @see {@link ContextManagement} for the schema.
 * @stability stable
 * @category models
 */
export type ContextManagement = Schema.Schema.Type<typeof ContextManagement>;

/**
 * Creates a tagged context-management payload with the current data version.
 *
 * **Details**
 *
 * The payload can be passed to a trajectory event builder or session writer.
 * Construction does not perform the context transformation.
 *
 * @see {@link contextManagementEvent} for the declaration.
 * @see {@link eventkit} for the decoding kit.
 * @stability stable
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
 * The kit containing the ATIF context-management declaration.
 *
 * @see {@link contextManagement} for a payload accepted by the kit.
 * @stability stable
 * @category constants
 */
export const eventkit = EventKit.make(contextManagementEvent);
