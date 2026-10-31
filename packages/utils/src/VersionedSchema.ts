/**
 * Schemas reading historical payloads and writing the current version.
 *
 * {@link make} starts a version history and {@link upgrade} adds a migration.
 * {@link TaggedUnion} groups versioned schemas under named tags.
 *
 * @stability stable
 */

import { Schema, SchemaGetter } from "effect";

import { assemble, tagSchema } from "#/internal/versioned.ts";

type Reading<Prev extends Schema.Top, Next extends Schema.Top, RD = never> = Schema.decodeTo<
  Next,
  Prev,
  RD,
  never
>;

/**
 * A schema union with its current writable schema in `self`.
 *
 * **Details**
 *
 * Decoding accepts current payloads and configured historical versions.
 * Encoding uses the current schema.
 * Fields and migrations may require services.
 * The services of the fields and migrations are what decoding requires.
 *
 * @see {@link make} for starting a version history.
 * @see {@link upgrade} for adding migrations.
 * @stability stable
 * @category schemas
 */
export type VersionedSchema<
  Self extends Schema.Struct<Schema.Struct.Fields>,
  Members extends ReadonlyArray<Schema.Top> = ReadonlyArray<Schema.Top>,
> = Schema.Union<Members> & {
  readonly self: Self;
};

/**
 * A {@link VersionedSchema} without specific fields or historical members.
 *
 * @stability stable
 * @category utility types
 */
export type Any = VersionedSchema<Schema.Struct<Schema.Struct.Fields>>;

/**
 * A {@link VersionedSchema} accepting previous payloads and decoding them into new fields.
 *
 * @see {@link upgrade} for construction.
 * @stability stable
 * @category utility types
 */
export type Upgraded<
  Prev extends Any,
  More extends Schema.Struct.Fields & { readonly version: AnyVersion },
  RD = never,
> = VersionedSchema<
  Schema.Struct<More>,
  readonly [Schema.Struct<More>, Reading<Prev, Schema.Struct<More>, RD>]
>;

/**
 * Starts a version history from a struct with a literal string `version`.
 *
 * **Details**
 *
 * The supplied schema becomes `self` and the only initial union member.
 *
 * @see {@link upgrade} for accepting older versions after a schema change.
 * @stability stable
 * @category constructors
 */
export const make = <
  Self extends Schema.Struct<Schema.Struct.Fields & { readonly version: AnyVersion }>,
>(
  schema: Self,
): VersionedSchema<Self, readonly [Self]> => assemble<Self, readonly [Self]>(schema, [schema]);

/**
 * Adds a current schema and a migration from the previous version history.
 *
 * **When to use**
 *
 * Use when stored payloads must remain readable after fields change.
 *
 * **Details**
 *
 * `fields` receives the previous `self` fields and returns the new fields.
 * `decode` receives the previous decoded value and returns the new encoded value.
 * The services of `fields` and `decode` are what decoding the derived version requires.
 * Earlier migrations remain reachable through the previous schema.
 * Encoding writes the new schema, not a historical version.
 *
 * **Gotchas**
 *
 * The migration must produce the new encoded representation, including its `version`.
 * The caller must choose a distinct version literal.
 *
 * **Example** (Migrating a renamed field)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, SchemaGetter } from "effect"
 * import * as VersionedSchema from "@trajs/utils/VersionedSchema"
 *
 * const first = Schema.Struct({ version: Schema.Literal("1"), name: Schema.String }).pipe(VersionedSchema.make)
 * const second = first.pipe(VersionedSchema.upgrade(
 *   () => ({ version: Schema.Literal("2"), label: Schema.String }),
 *   { decode: SchemaGetter.transform((previous) => ({ version: "2" as const, label: previous.name })) },
 * ))
 * const value = await Effect.runPromise(Schema.decodeUnknownEffect(second)({ version: "1", name: "run" }))
 *
 * value // => { version: "2", label: "run" }
 * ```
 *
 * @see {@link across} for a union without migration.
 * @stability stable
 * @category combinators
 */
export const upgrade =
  <
    Prev extends Any,
    More extends Schema.Struct.Fields & { readonly version: AnyVersion },
    RD = never,
  >(
    fields: (previous: Prev["self"]["fields"]) => More,
    change: {
      readonly decode: SchemaGetter.Getter<Schema.Struct<More>["Encoded"], Prev["Type"], RD>;
    },
  ) =>
  (previous: Prev): Upgraded<Prev, More, RD> => {
    const self = previous.self.mapFields(fields);

    const step = Schema.decodeTo<Schema.Struct<More>, Prev, RD, never>(self, {
      decode: change.decode,
      encode: SchemaGetter.forbiddenEncoding,
    })(previous);

    return assemble<
      Schema.Struct<More>,
      readonly [Schema.Struct<More>, Reading<Prev, Schema.Struct<More>, RD>]
    >(self, [self, step]);
  };

/**
 * Combines the members of two schema unions without migrating between them.
 *
 * **Gotchas**
 *
 * The result has no `self` or `table` property.
 * Member order follows `a`, then `b`.
 *
 * @see {@link upgrade} for migrating historical values into one current schema.
 * @stability stable
 * @category combining
 */
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

/**
 * A schema union retaining its versioned members in `table`.
 *
 * @see {@link TaggedUnion} for construction and tag behavior.
 * @stability stable
 * @category schemas
 */
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

/**
 * Creates a union with each table key added as its member's `_tag`.
 *
 * **Details**
 *
 * Each member keeps its version history.
 * Decoding historical payloads adds the member's tag.
 * Encoding writes the current fields with that tag.
 * `table` holds the tagged schemas for later upgrades.
 *
 * **Gotchas**
 *
 * Historical payloads can omit `_tag`.
 * Overlapping untagged schemas can match more than one member.
 *
 * @see {@link upgradeTags} for rebuilding a union from an updated table.
 * @stability stable
 * @category constructors
 */
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

/**
 * Rebuilds a tagged union from a mapping of its existing table.
 *
 * **Details**
 *
 * The mapping can upgrade, add, remove, or rename members.
 * Resulting table keys determine the new tags.
 *
 * **Gotchas**
 *
 * Omitted members lose their decoding histories.
 * Retaining a member's history requires retaining or upgrading its schema.
 *
 * @see {@link upgrade} for migrating one member.
 * @see {@link TaggedUnion} for tag construction.
 * @stability stable
 * @category combinators
 */
export const upgradeTags =
  <Table extends Schemas, Next extends Schemas>(mapping: (table: Table) => Next) =>
  (previous: TaggedUnion<Table>): TaggedUnion<TaggedTable<Next>> =>
    TaggedUnion(mapping(previous.table));

/**
 * A literal string schema for a payload's `version` field.
 *
 * @see {@link make} for starting a version history.
 * @stability stable
 * @category utility types
 */
export type AnyVersion = Schema.Literal<string>;

/**
 * A struct schema retaining a literal string `version` field.
 *
 * @see {@link VersionedSchema} for historical decoding support.
 * @stability stable
 * @category utility types
 */
export type AnyVersioned = Schema.Struct<{ readonly version: AnyVersion }>;
