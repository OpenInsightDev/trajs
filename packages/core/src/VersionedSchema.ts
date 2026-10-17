/**
 * Data that is stated one version at a time, and read at whichever of its versions
 * it was written at: {@link make} states the first version of a shape,
 * {@link upgrade} derives the version next from it, {@link across} reads the
 * versions of two shapes as the versions of one, and {@link TaggedUnion} states
 * the schemas of several tags as one, whose versions {@link upgradeTags} derives a tag
 * at a time.
 */

import { Schema, SchemaGetter } from "effect";

type Reading<Prev extends Schema.Top, Next extends Schema.Top, RD> = Schema.decodeTo<
  Next,
  Prev,
  RD,
  never
>;

/**
 * A shape stated one version at a time: the version next, and how data of every
 * version before it reads as that one.
 *
 * **When to use**
 *
 * Use to type data that is written at a version of its own, such as the data an
 * extension contributes to a trajectory — see {@link Extension.Extension}.
 *
 * **Details**
 *
 * `self` is the schema of the version next, and the union is what reads: it holds a
 * member for every version the data was written at, so data of any of them reads as
 * the newest one. A shape stated by {@link make} holds one member, its only version;
 * every member {@link upgrade} adds reads the version before it, which is how a
 * trajectory written at an older version still reads.
 *
 * @see {@link make} for the first version of a shape.
 * @see {@link upgrade} for deriving the version next.
 * @category models
 */
export type VersionedSchema<
  Self extends Schema.Struct<Schema.Struct.Fields>,
  Members extends ReadonlyArray<Schema.Top> = ReadonlyArray<Schema.Top>,
> = Schema.Union<Members> & {
  readonly self: Self;
};

/**
 * A shape whose versions are not known.
 *
 * @see {@link VersionedSchema} for a shape of known versions.
 * @category models
 */
export type Any = VersionedSchema<Schema.Struct<Schema.Struct.Fields>, ReadonlyArray<Schema.Top>>;

/**
 * The versioned schema `Prev` is at once `More` is derived of it: the version next,
 * and its reading of every version before it.
 *
 * **When to use**
 *
 * Use to type what a call of {@link upgrade} returns, such as the schema of an
 * extension that a step moved on.
 *
 * @see {@link upgrade} for the call that derives one.
 * @category models
 */
export type Upgraded<
  Prev extends Any,
  More extends Schema.Struct.Fields & { readonly version: AnyVersion },
  RD = never,
> = VersionedSchema<
  Schema.Struct<More>,
  readonly [Schema.Struct<More>, Reading<Prev, Schema.Struct<More>, RD>]
>;

function assemble<
  Self extends Schema.Struct<Schema.Struct.Fields>,
  Members extends ReadonlyArray<Schema.Top>,
>(self: Self, readers: ReadonlyArray<Schema.Top>): VersionedSchema<Self, Members>;
function assemble(self: Schema.Top, readers: ReadonlyArray<Schema.Top>): Schema.Top {
  return Object.assign(Schema.Union(readers), { self });
}

/**
 * States the first version of a shape.
 *
 * **When to use**
 *
 * Use to state the shape of the data an extension contributes: what it attaches to
 * a message part, the events it produces, and what a producer yields.
 *
 * **Details**
 *
 * The schema given is the shape's only version, and states its own `version`, which
 * is what tells a datum of it from a datum of the version next. The shape returned
 * reads and writes that version alone; a version is derived from it by
 * {@link upgrade}.
 *
 * **Example** (Stating the first version of a shape)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { VersionedSchema } from "@trajs/core"
 *
 * const estimate = Schema.Struct({
 *   version: Schema.Literal("0.1.0"),
 *   tokens: Schema.Number
 * }).pipe(VersionedSchema.make)
 *
 * estimate.self.fields.version.literal // => "0.1.0"
 * ```
 *
 * @see {@link upgrade} for deriving the version next of one.
 * @category constructors
 */
export const make = <Self extends Schema.Struct<{ readonly version: Schema.Literal<string> }>>(
  schema: Self,
): VersionedSchema<Self, readonly [Self]> => assemble<Self, readonly [Self]>(schema, [schema]);

/**
 * Derives the version next of a shape from the version before it.
 *
 * **When to use**
 *
 * Use when a shape gains, loses or renames a field, so that a trajectory written at
 * the version before still reads as the version next.
 *
 * **Details**
 *
 * `fields` are the version next's own: the fields of the version before, as the
 * caller changes them. `change.decode` reads a datum of the version before as one of
 * the version next, which is what makes a trajectory of either version read the same
 * way. Writing goes one way only: every version a shape holds writes as the version
 * next.
 *
 * The function is curried, and given the step returns the function that moves a
 * shape, so it is given to `pipe` — see the example.
 *
 * **Example** (Deriving the version next of a shape, and reading the one before it)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, SchemaGetter } from "effect"
 * import { VersionedSchema } from "@trajs/core"
 *
 * const first = Schema.Struct({
 *   version: Schema.Literal("0.1.0"),
 *   tokens: Schema.Number
 * }).pipe(VersionedSchema.make)
 *
 * const next = first.pipe(
 *   VersionedSchema.upgrade(
 *     (fields) => ({
 *       ...fields,
 *       version: Schema.Literal("0.1.1"),
 *       media: Schema.optional(Schema.String)
 *     }),
 *     { decode: SchemaGetter.transform((from) => ({ ...from, version: "0.1.1" })) }
 *   )
 * )
 *
 * const read = await Effect.runPromise(
 *   Schema.decodeUnknownEffect(next)({ version: "0.1.0", tokens: 3 })
 * )
 * read // => { version: "0.1.1", tokens: 3 }
 * ```
 *
 * @see {@link make} for the first version of a shape.
 * @see {@link Upgraded} for what a move returns.
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

export const across = <
  AMembers extends ReadonlyArray<Schema.Top>,
  BMembers extends ReadonlyArray<Schema.Top>,
>(
  a: Schema.Union<AMembers>,
  b: Schema.Union<BMembers>,
): Schema.Union<readonly [...AMembers, ...BMembers]> => Schema.Union([...a.members, ...b.members]);

/** The schemas a tagged union holds, keyed by the tag each one's data carries. */
type Schemas = Readonly<Record<string, Any>>;

/** The newest schema of one tag: the fields the schema states, and the tag the schema is keyed by. */
type TaggedSelf<Tag extends string, Entry extends Any> = Schema.Struct<
  { readonly _tag: Schema.Literal<Tag> } & Entry["self"]["fields"]
>;

/**
 * The versioned schema of one tag: the schema it was keyed by, with the tag of its key
 * stated on every version of it.
 */
type TaggedEntry<Tag extends string, Entry extends Any> = VersionedSchema<
  TaggedSelf<Tag, Entry>,
  readonly [TaggedSelf<Tag, Entry>, Reading<Writing<Entry>, TaggedSelf<Tag, Entry>, never>]
>;

/**
 * A schema as it writes its newest version: the counterpart of {@link Reading} for the
 * direction a version is written in, so that a tag is stated on the data rather than on
 * what was read.
 */
type Writing<Entry extends Any> = Reading<Entry, Schema.flip<Entry>, never>;

/** The schemas a table holds once the tag of each key is stated on the schema that key names. */
type TaggedTable<Table extends Schemas> = {
  readonly [K in keyof Table & string]: TaggedEntry<K, Table[K]>;
};

/**
 * Data of several tags, read as one, held with the table of schemas that states it.
 *
 * **When to use**
 *
 * Use to type data of several kinds that is produced together and read back without
 * knowing which kind it is — what an extension yields of a part beside what it fails
 * with, or what each extension of a kit contributes to a trajectory.
 *
 * **Details**
 *
 * `table` holds the schema of each tag, and the union is what reads: a member for
 * every tag, in the order the table holds them, so a datum of any of them reads as
 * the newest version of its own tag. Nothing is derived across tags: a datum is read
 * by the schema its tag names, and one whose tag no entry names is not read at all.
 *
 * A tag is stated once and changed once, so the table is where a version is read from
 * and what a version change is written against: {@link upgradeTags} is given the table
 * to map, and a tag the mapping does not name is carried over.
 *
 * @see {@link upgradeTags} for deriving the version next of a tag.
 * @category models
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

const tagSchema = (tag: string, entry: Any): Any => {
  const self = entry.self.mapFields((fields) => ({ ...fields, _tag: Schema.Literal(tag) }));

  const writing = Schema.decodeTo(Schema.flip(entry), {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.forbiddenEncoding,
  })(entry);

  // SAFETY: every version states its version, so what a version is written as is an
  // object the tag is stated beside rather than a value of no fields.
  const reading = Schema.decodeTo(self, {
    decode: SchemaGetter.transform((from) => ({
      ...(from as AnyVersioned["Encoded"]),
      _tag: tag,
    })),
    encode: SchemaGetter.forbiddenEncoding,
  })(writing);

  return assemble(self, [self, reading]);
};

/**
 * States the schemas of several tags as one tagged union.
 *
 * **When to use**
 *
 * Use to state the data a trajectory holds of several kinds as one: the two schemas an
 * extension derives a trajectory with, or the schema each extension of a kit
 * contributes to one.
 *
 * **Details**
 *
 * The table given states one schema per tag, keyed by the tag the data of that schema is
 * to carry. Each schema is a shape stated one version at a time like any other, and need
 * state no tag of its own: the tag of its key is the one its data carries, and a tag a
 * schema states itself is stated over. Every schema is stated again with that tag, so what
 * the table holds is the tagged schema rather than the schema that was given — read a
 * tag's newest shape as `table.<tag>.self`.
 *
 * What is returned reads a datum of any tag at any version, each as the schema of its own
 * tag reads it, and writes it as that tag's newest version. The tags are read in the order
 * the table gives them — see {@link upgradeTags} for deriving the version next of a
 * tag.
 *
 * **Example** (Stating the data of two tags as one)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { VersionedSchema } from "@trajs/core"
 *
 * const estimate = Schema.Struct({
 *   version: Schema.Literal("0.1.0"),
 *   tokens: Schema.Number
 * }).pipe(VersionedSchema.make)
 *
 * const uncounted = Schema.Struct({
 *   version: Schema.Literal("0.1.0"),
 *   reason: Schema.String
 * }).pipe(VersionedSchema.make)
 *
 * // Neither schema states a tag of its own: `Estimate` and `Uncounted` are the tags
 * // the data of each carries.
 * const derived = VersionedSchema.TaggedUnion({
 *   Estimate: estimate,
 *   Uncounted: uncounted
 * })
 *
 * const read = Schema.decodeUnknownSync(derived)({
 *   _tag: "Uncounted",
 *   version: "0.1.0",
 *   reason: "no tokenizer"
 * })
 * read._tag // => "Uncounted"
 * ```
 *
 * @see {@link upgradeTags} for deriving the version next of a tag.
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
 * Derives the version next of each tag a mapping moves, and leaves the others as they
 * are.
 *
 * **When to use**
 *
 * Use when the schemas a union holds are to change: when a tag's shape gains, loses or
 * renames a field — {@link upgrade} written for that tag is the change to make — or when
 * a tag is added, dropped or replaced by another schema.
 *
 * **Details**
 *
 * The mapping is given the table the union holds and the table it returns is the one the
 * result holds, so a tag it does not name is carried over as the schema it was:
 * `(table) => ({ ...table, Estimate: … })` moves one tag on and leaves the others. The
 * keys of the returned table are read as tags again, as they are where a union is stated,
 * so a mapping states the tag of each schema it holds whether or not the schema states
 * one of its own.
 *
 * **Example** (Moving one tag on, and reading the data of the version before it)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaGetter } from "effect"
 * import { VersionedSchema } from "@trajs/core"
 *
 * const estimate = Schema.Struct({
 *   version: Schema.Literal("0.1.0"),
 *   tokens: Schema.Number
 * }).pipe(VersionedSchema.make)
 *
 * const uncounted = Schema.Struct({
 *   version: Schema.Literal("0.1.0"),
 *   reason: Schema.String
 * }).pipe(VersionedSchema.make)
 *
 * const derived = VersionedSchema.TaggedUnion({
 *   Estimate: estimate,
 *   Uncounted: uncounted
 * })
 *
 * const next = derived.pipe(
 *   VersionedSchema.upgradeTags((table) => ({
 *     ...table,
 *     Estimate: table.Estimate.pipe(
 *       VersionedSchema.upgrade(
 *         (fields) => ({
 *           ...fields,
 *           version: Schema.Literal("0.1.1"),
 *           media: Schema.optional(Schema.String)
 *         }),
 *         { decode: SchemaGetter.transform((from) => ({ ...from, version: "0.1.1" as const })) }
 *       )
 *     )
 *   }))
 * )
 *
 * next.table.Estimate.self.fields.version.literal // => "0.1.1"
 *
 * const read = Schema.decodeUnknownSync(next)({
 *   _tag: "Estimate",
 *   version: "0.1.0",
 *   tokens: 3
 * })
 * read.version // => "0.1.1"
 * ```
 *
 * @see {@link TaggedUnion} for stating the table it moves.
 * @see {@link upgrade} for deriving the version next of one shape.
 * @category combinators
 */
export const upgradeTags =
  <Table extends Schemas, Next extends Schemas>(mapping: (table: Table) => Next) =>
  (previous: TaggedUnion<Table>): TaggedUnion<TaggedTable<Next>> =>
    TaggedUnion(mapping(previous.table));

export type AnyVersion = Schema.Literal<string>;

export type AnyVersioned = Schema.Struct<{ readonly version: AnyVersion }>;
