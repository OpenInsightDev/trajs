/**
 * Data that is stated one version at a time, and read at whichever of its versions
 * it was written at: {@link make} states the first version of a shape,
 * {@link upgrade} derives the version next from it, and {@link across} reads the
 * versions of two shapes as the versions of one.
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
 * extension contributes to a recording — see {@link Extension.Extension}.
 *
 * **Details**
 *
 * `self` is the schema of the version next, and the union is what reads: it holds a
 * member for every version the data was written at, so data of any of them reads as
 * the newest one. A shape stated by {@link make} holds one member, its only version;
 * every member {@link upgrade} adds reads the version before it, which is how a
 * recording written at an older version still reads.
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
 * a message part, the events it records, and what a producer yields.
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
 * Use when a shape gains, loses or renames a field, so that a recording written at
 * the version before still reads as the version next.
 *
 * **Details**
 *
 * `fields` are the version next's own: the fields of the version before, as the
 * caller changes them. `change.decode` reads a datum of the version before as one of
 * the version next, which is what makes a recording of either version read the same
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

/**
 * Reads the versions of two shapes as the versions of one.
 *
 * **When to use**
 *
 * Use when data is read against versions that were derived apart, such as by two
 * packages that moved the same shape on from a version they share.
 *
 * **Details**
 *
 * The members of both are the members of the result, in the order they were given,
 * so a datum of any version either shape holds reads. No version is derived and
 * nothing is read of a version neither holds: use {@link upgrade} to derive one.
 *
 * @see {@link upgrade} for deriving the version next of a shape.
 * @see {@link VersionedSchema} for the shape such a union belongs to.
 * @category combinators
 */
export const across = <
  AMembers extends ReadonlyArray<Schema.Top>,
  BMembers extends ReadonlyArray<Schema.Top>,
>(
  a: Schema.Union<AMembers>,
  b: Schema.Union<BMembers>,
): Schema.Union<readonly [...AMembers, ...BMembers]> => Schema.Union([...a.members, ...b.members]);

/**
 * The version literal of any versioned data: any `Schema.Literal` of a string,
 * which is what every version of every extension's data states.
 *
 * @see {@link AnyVersioned} for the shape of the schema that states one.
 * @category models
 */
export type AnyVersion = Schema.Literal<string>;

/**
 * The shape of the versioned schema of any extension's data.
 *
 * @see {@link AnyVersion} for the version it states.
 * @category models
 */
export type AnyVersioned = Schema.Struct<{ readonly version: AnyVersion }>;
