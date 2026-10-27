/**
 * Versioned event declarations and tagged event payloads.
 *
 * {@link Event} names an event schema.
 * {@link EventParts} reads the events declared by a kit.
 *
 * @stability stable
 */

import { Data, Schema } from "effect";

import type * as EventKit from "#/EventKit.ts";
import type { PackageMetadata } from "#/PackageMetadata.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/**
 * Optional display information for an {@link Event}.
 *
 * @stability stable
 * @category schemas
 */
export class Metadata extends Schema.Class<Metadata>("Metadata")({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

/**
 * An event declaration with a versioned payload schema.
 *
 * **Details**
 *
 * `tag` joins `packageName` and `id` with `/`.
 * Kits and event parts use this tag as the event's identity.
 * `packageMetadata` is what the declaring package states of itself.
 *
 * @see {@link EventKit.make} for collecting declarations.
 * @see {@link EventPart} for a tagged payload.
 * @stability stable
 * @category models
 */
export class Event<
  Pkg extends string,
  Id extends string,
  S extends VersionedSchema.Any,
> extends Data.Class<{
  packageName: Pkg;
  id: Id;
  metadata: Metadata;
  packageMetadata?: PackageMetadata;
  schema: S;
}> {
  get tag(): `${Pkg}/${Id}` {
    return `${this.packageName}/${this.id}`;
  }
}

/**
 * An {@link Event} without specific identity or payload types.
 *
 * @stability stable
 * @category utility types
 */
export type Any = Event<string, string, VersionedSchema.Any>;

/**
 * An event payload identified by its declaration's tag.
 *
 * @see {@link EventPart} for the schema.
 * @stability stable
 * @category models
 */
export type EventPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

/**
 * Creates a schema for a tagged event payload.
 *
 * @see {@link EventParts} for all declarations of a kit.
 * @stability stable
 * @category schemas
 */
export const EventPart = <Tag extends string, S extends Schema.Top>(tag: Tag, schema: S) =>
  Schema.TaggedStruct(tag, { data: schema });

type EventPartSchema<Ext> = Ext extends Any
  ? Schema.TaggedStruct<Ext["tag"], { readonly data: Ext["schema"] }>
  : never;

type EventPartSchemas<Events extends Record<string, Any>> = EventPartSchema<Events[keyof Events]>;

type EventPartOf<Ext> = Ext extends Any
  ? EventPart<Ext["tag"], Schema.Schema.Type<Ext["schema"]>>
  : never;

/**
 * The tagged payloads of a record of {@link Event} declarations.
 *
 * @see {@link EventParts} for the schema built from a kit.
 * @stability stable
 * @category models
 */
export type EventParts<Events extends Record<string, Any>> = EventPartOf<Events[keyof Events]>;

/**
 * Creates a union schema for the events declared by `kit`.
 *
 * **Details**
 *
 * Each payload uses its declaration's tag and versioned schema.
 * An empty kit accepts no event payloads.
 *
 * @see {@link EventPart} for a single payload schema.
 * @stability stable
 * @category schemas
 */
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
