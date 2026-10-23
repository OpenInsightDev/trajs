import { Data, Schema } from "effect";

import type * as EventKit from "#/EventKit.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

export class Metadata extends Schema.Class<Metadata>("Metadata")({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

export class Event<
  Pkg extends string,
  Id extends string,
  S extends VersionedSchema.Any,
> extends Data.Class<{
  package: Pkg;
  id: Id;
  metadata: Metadata;
  schema: S;
}> {
  get tag(): `${Pkg}/${Id}` {
    return `${this.package}/${this.id}`;
  }
}

export type Any = Event<string, string, VersionedSchema.Any>;

export type EventPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

export const EventPart = <Tag extends string, S extends Schema.Top>(tag: Tag, schema: S) =>
  Schema.TaggedStruct(tag, { data: schema });

type EventPartSchema<Ext> = Ext extends Any
  ? Schema.TaggedStruct<Ext["tag"], { readonly data: Ext["schema"] }>
  : never;

type EventPartSchemas<Events extends Record<string, Any>> = EventPartSchema<Events[keyof Events]>;

type EventPartOf<Ext> = Ext extends Any
  ? EventPart<Ext["tag"], Schema.Schema.Type<Ext["schema"]>>
  : never;

export type EventParts<Events extends Record<string, Any>> = EventPartOf<Events[keyof Events]>;

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
