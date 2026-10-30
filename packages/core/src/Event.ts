/**
 * Versioned event declarations and tagged event payloads.
 *
 * {@link Event} names an event schema.
 * {@link EventSchema} states one declaration as a stored header holds it.
 * {@link EventParts} reads the events declared by a kit.
 *
 * @stability stable
 */

import { Data, Schema } from "effect";

import type * as EventKit from "#/EventKit.ts";
import { documentOf, requireBinaryLayout } from "#/internal/schema.ts";
import { PackageMetadata } from "#/Package.ts";
import { SchemaDocument } from "#/SchemaDocument.ts";

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

type Fields<Pkg extends string, Id extends string, S extends Schema.Top> = {
  packageName: Pkg;
  id: Id;
  metadata?: Metadata;
  packageMetadata?: PackageMetadata;
  schema: S;
};

/**
 * An event declaration with a payload schema.
 *
 * **Details**
 *
 * `tag` joins `packageName` and `id` with `/`.
 * Kits and event parts use this tag as the event's identity.
 * A payload schema built with `VersionedSchema.make` reads historical payloads.
 * `packageMetadata` is what the declaring package states of itself.
 *
 * **Gotchas**
 *
 * Construction throws a `TrajectoryError` for a schema `SchemaBinary` cannot lay out.
 *
 * @see {@link make} for building a declaration from its fields.
 * @see {@link makeUnknown} for an event named without its payload schema.
 * @see {@link EventKit.make} for collecting declarations.
 * @see {@link EventPart} for a tagged payload.
 * @stability stable
 * @category models
 */
export class Event<Pkg extends string, Id extends string, S extends Schema.Top> extends Data.Class<
  Fields<Pkg, Id, S>
> {
  constructor(fields: Fields<Pkg, Id, S>) {
    super(fields);

    requireBinaryLayout(fields.schema);
  }

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
export type Any = Event<string, string, Schema.Top>;

/**
 * Creates an event declaration from the fields it states.
 *
 * **Details**
 *
 * `metadata` and `packageMetadata` are optional.
 *
 * @see {@link makeUnknown} for an event named without its payload schema.
 * @see {@link Event} for the declaration those fields make.
 * @stability stable
 * @category constructors
 */
export const make = <Pkg extends string, Id extends string, S extends Schema.Top>(
  fields: Fields<Pkg, Id, S>,
): Event<Pkg, Id, S> => new Event(fields);

/**
 * Declares an event whose payload schema accepts any data.
 *
 * **When to use**
 *
 * Use where a kit names an event whose payload schema the caller does not hold.
 *
 * **Details**
 *
 * Identity is all the declaration states, so no payload field is checked.
 *
 * @see {@link make} for a declaration with its payload schema.
 * @see {@link EventKit.make} for collecting declarations.
 * @stability stable
 * @category constructors
 */
export const makeUnknown = <Pkg extends string, Id extends string>(
  packageName: Pkg,
  id: Id,
): Event<Pkg, Id, typeof Schema.Unknown> => make({ packageName, id, schema: Schema.Unknown });

/**
 * Schema for a stored event declaration.
 *
 * **Details**
 *
 * The declaration states the package it is in and its payload schema.
 * `metadata` and `packageMetadata` are optional.
 * The payload schema is a {@link SchemaDocument} of the versions it accepts.
 *
 * @see {@link encode} for storing a declaration.
 * @see {@link EventKit.EventKitSchema} for the record a stored header holds.
 * @stability stable
 * @category schemas
 */
export const EventSchema = Schema.Struct({
  metadata: Schema.optional(Metadata),
  packageMetadata: Schema.optional(PackageMetadata),
  schema: SchemaDocument,
});

/**
 * A stored event declaration without its decoding schema.
 *
 * @see {@link EventSchema} for the schema.
 * @stability stable
 * @category models
 */
export type EventSchema = Schema.Schema.Type<typeof EventSchema>;

/**
 * Converts an event declaration into its stored form.
 *
 * **When to use**
 *
 * Use to describe an event without its decoding schema.
 *
 * **Details**
 *
 * The payload schema becomes a {@link SchemaDocument} of the versions it accepts.
 *
 * **Gotchas**
 *
 * Building a document can throw for a schema it cannot state.
 * The result states the encoded side, not the decoding transformations.
 *
 * @see {@link EventSchema} for the stored form.
 * @see {@link EventKit.encode} for the stored form of a whole kit.
 * @stability stable
 * @category encoding
 */
export const encode = (event: Any): EventSchema => ({
  metadata: event.metadata,
  packageMetadata: event.packageMetadata,
  schema: documentOf(event.schema),
});

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
