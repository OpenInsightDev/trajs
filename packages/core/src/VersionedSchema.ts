import { Schema, SchemaGetter } from "effect";

import {
  assemble,
  type ServiceFree,
  type ServiceFreeFields,
  tagSchema,
} from "#/internal/versioned.ts";

type Reading<Prev extends Schema.Top, Next extends Schema.Top> = Schema.decodeTo<
  Next,
  Prev,
  never,
  never
>;

export type VersionedSchema<
  Self extends Schema.Struct<ServiceFreeFields>,
  Members extends ReadonlyArray<ServiceFree> = ReadonlyArray<ServiceFree>,
> = Schema.Union<Members> & {
  readonly self: Self;
};

export type Any = VersionedSchema<Schema.Struct<ServiceFreeFields>>;

export type Upgraded<
  Prev extends Any,
  More extends ServiceFreeFields & { readonly version: AnyVersion },
> = VersionedSchema<
  Schema.Struct<More>,
  readonly [Schema.Struct<More>, Reading<Prev, Schema.Struct<More>>]
>;

export const make = <Self extends Schema.Struct<{ readonly version: Schema.Literal<string> }>>(
  schema: Self,
): VersionedSchema<Self, readonly [Self]> => assemble<Self, readonly [Self]>(schema, [schema]);

export const upgrade =
  <Prev extends Any, More extends ServiceFreeFields & { readonly version: AnyVersion }>(
    fields: (previous: Prev["self"]["fields"]) => More,
    change: {
      readonly decode: SchemaGetter.Getter<Schema.Struct<More>["Encoded"], Prev["Type"]>;
    },
  ) =>
  (previous: Prev): Upgraded<Prev, More> => {
    const self = previous.self.mapFields(fields);

    const step = Schema.decodeTo<Schema.Struct<More>, Prev, never, never>(self, {
      decode: change.decode,
      encode: SchemaGetter.forbiddenEncoding,
    })(previous);

    return assemble<
      Schema.Struct<More>,
      readonly [Schema.Struct<More>, Reading<Prev, Schema.Struct<More>>]
    >(self, [self, step]);
  };

export const across = <
  AMembers extends ReadonlyArray<Schema.Top>,
  BMembers extends ReadonlyArray<Schema.Top>,
>(
  a: Schema.Union<AMembers>,
  b: Schema.Union<BMembers>,
): Schema.Union<readonly [...AMembers, ...BMembers]> => Schema.Union([...a.members, ...b.members]);

type Schemas = Readonly<Record<string, Any>>;

type TaggedSelf<Tag extends string, Entry extends Any> = Schema.Struct<
  { readonly _tag: Schema.Literal<Tag> } & Entry["self"]["fields"]
>;

type TaggedEntry<Tag extends string, Entry extends Any> = VersionedSchema<
  TaggedSelf<Tag, Entry>,
  readonly [TaggedSelf<Tag, Entry>, Reading<Writing<Entry>, TaggedSelf<Tag, Entry>>]
>;

type Writing<Entry extends Any> = Reading<Entry, Schema.flip<Entry>>;

type TaggedTable<Table extends Schemas> = {
  readonly [K in keyof Table & string]: TaggedEntry<K, Table[K]>;
};

export type TaggedUnion<Table extends Schemas> = Schema.Union<ReadonlyArray<Table[keyof Table]>> & {
  readonly table: Table;
};

function assembleTagged<Table extends Schemas>(
  table: Table,
  members: ReadonlyArray<Schema.Top>,
): TaggedUnion<Table>;
function assembleTagged(table: Schemas, members: ReadonlyArray<Schema.Top>): Schema.Top {
  return Object.assign(Schema.Union(members), { table });
}

export const TaggedUnion = <const Table extends Schemas>(
  table: Table,
): TaggedUnion<TaggedTable<Table>> => {
  const tagged: Record<string, Any> = {};

  for (const [tag, schema] of Object.entries(table)) {
    tagged[tag] = tagSchema(tag, schema);
  }

  // SAFETY: each entry is the schema its key names with the tag of that key stated on
  // it, which is the table `TaggedTable` names for the table that was given.
  return assembleTagged<TaggedTable<Table>>(tagged as TaggedTable<Table>, Object.values(tagged));
};

export const upgradeTags =
  <Table extends Schemas, Next extends Schemas>(mapping: (table: Table) => Next) =>
  (previous: TaggedUnion<Table>): TaggedUnion<TaggedTable<Next>> =>
    TaggedUnion(mapping(previous.table));

export type AnyVersion = Schema.Literal<string>;

export type AnyVersioned = Schema.Struct<{ readonly version: AnyVersion }>;
