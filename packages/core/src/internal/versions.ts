/**
 * Builds a line of document versions: a schema per version, each of which reads
 * every version up to it.
 *
 * A version is built from the version before it, and carries both halves of that
 * change in one declaration: the fields that make its shape, and the data mapping
 * that makes a value of it.
 *
 * ```ts
 * export const V1_5 = Schema.Struct({
 *   version: Schema.Literal("1.5"),
 *   url: Schema.String,
 * }).pipe(Versions.make);
 *
 * export const V1_6 = V1_5.pipe(
 *   Versions.upgrade(
 *     (fields) => ({ ...fields, version: Schema.Literal("1.6"), host: Schema.String }),
 *     {
 *       decode: SchemaGetter.transform((from) => ({
 *         ...from,
 *         version: "1.6",
 *         host: new URL(from.url).hostname,
 *       })),
 *     },
 *   ),
 * );
 *
 * const document = Schema.decodeUnknownSync(V1_6)({ version: "1.5", url: "https://example.com" });
 * document; // { version: "1.6", url: "https://example.com", host: "example.com" }
 * Schema.decodeUnknownSync(V1_6)({ version: "1.6", url: "https://example.com", host: "example.com" });
 * Schema.encodeSync(V1_6)(document); // { version: "1.6", url: "https://example.com", host: "example.com" }
 * ```
 *
 * - `Versions.make` is the oldest version: a schema written out by hand, piped
 *   into it, with no upgrade into it. That is also how a version that is *not*
 *   forward compatible is written — there is nothing to declare, it just starts
 *   its own line.
 * - `Versions.upgrade(fields, change)` builds the next version: its fields and the
 *   data mapping that makes a value of it, in one place. The data mapping turns a
 *   value of the version below into the *encoded* form of the new version — the
 *   form the new version's own schema decodes, so nothing skips validation — and
 *   it is checked against the shape the field mapping produced, so the two cannot
 *   drift apart. Both carry the version literal, which is what tells the versions
 *   apart.
 * - A version reads its whole line: it accepts every version up to itself and
 *   decodes them all to its own value, so no separate reader has to be asked for.
 *   It encodes its own value too, because the newest version is what a line is
 *   written as.
 * - `Versions.across(a, b)` reads several lines at once, keeping the versions
 *   distinct: the decoded value keeps its `version` tag, so a caller can tell
 *   which line a document came from.
 *
 * A version also holds `self`: its own shape alone, without the earlier versions
 * its reader accepts. That is the shape the next version is built from, and the one
 * to reach for when only a single version's fields are meant.
 *
 * A version is assembled when it is defined, so it holds one reader per version
 * up to it — a line of N versions holds N(N+1)/2 readers — and nothing is built on
 * first use.
 *
 * Steps are one-way. A data mapping produces the *encoded* form of the version it
 * upgrades into — the form that version's own schema decodes — so every hop is
 * still validated by the version it arrives at, and nothing ever reconstructs the
 * document it came from.
 */
import { Schema, SchemaGetter } from "effect";

/** Every member of `Members`, chained forward into `Next`. */
type Upgrade<Members extends ReadonlyArray<Schema.Top>, Next extends Schema.Top, RD> = {
  readonly [K in keyof Members]: Schema.decodeTo<Next, Members[K], RD, never>;
};

/**
 * A version: the schema that reads every version up to it, and the shape it was
 * declared with.
 *
 * `Members` is one reader per version of the line, newest first — the version's
 * own shape, then a step from each earlier version — and `self` is that first
 * member on its own.
 */
export type Version<
  Self extends Schema.Struct<Schema.Struct.Fields>,
  Members extends ReadonlyArray<Schema.Top> = ReadonlyArray<Schema.Top>,
> = Schema.Union<Members> & {
  /**
   * The version's own shape: the fields it declares, and the form it encodes to.
   */
  readonly self: Self;
};

/**
 * Assembles a version from its own shape and the readers it accepts.
 *
 * The overload carries the members as a tuple, which the spread the callers build
 * cannot write down.
 */
function assemble<
  Self extends Schema.Struct<Schema.Struct.Fields>,
  Members extends ReadonlyArray<Schema.Top>,
>(self: Self, readers: ReadonlyArray<Schema.Top>): Version<Self, Members>;
function assemble(self: Schema.Top, readers: ReadonlyArray<Schema.Top>): Schema.Top {
  return Object.assign(Schema.Union(readers), { self });
}

/** Builds a line of document versions, from the oldest one up. */
export const Versions = {
  /**
   * The oldest version of a line: a schema written out by hand, with no upgrade
   * into it.
   */
  make<Self extends Schema.Struct<{ readonly version: Schema.Literal<string> }>>(
    this: void,
    schema: Self,
  ): Version<Self, readonly [Self]> {
    return assemble<Self, readonly [Self]>(schema, [schema]);
  },
  /**
   * Builds a version from the version before it: the version literal, the fields
   * that make its shape, and the data mapping that makes a value of it.
   *
   * `fields` is passed to `Schema.Struct.mapFields`, so it inherits the previous
   * version's fields unless it overrides or drops them.
   *
   * Taking `fields` as its own argument, rather than as a field of `change`, is
   * what lets the compiler read the previous version's type off the pipe — the
   * same shape as `Schema.extendTo`.
   */
  upgrade<
    Prev extends Version<Schema.Struct<Schema.Struct.Fields>, ReadonlyArray<Schema.Top>>,
    More extends Schema.Struct.Fields & { readonly version: Schema.Literal<string> },
    RD = never,
  >(
    fields: (previous: Prev["self"]["fields"]) => More,
    change: {
      /** Produces this version's encoded form, which its own schema then validates. */
      readonly decode: SchemaGetter.Getter<Schema.Struct<More>["Encoded"], Prev["Type"], RD>;
    },
  ) {
    return (
      previous: Prev,
    ): Version<
      Schema.Struct<More>,
      readonly [Schema.Struct<More>, ...Upgrade<Prev["members"], Schema.Struct<More>, RD>]
    > => {
      const self = previous.self.mapFields(fields);

      // One step per earlier version. Each member below already decodes its own
      // version up to the one this was built from, so appending this version's
      // change leaves one step per version, every one of them validated by this
      // version's own shape.
      const step = (member: Prev["members"][number]) =>
        Schema.decodeTo<Schema.Struct<More>, Prev["members"][number], RD, never>(self, {
          decode: change.decode,
          encode: SchemaGetter.forbiddenEncoding,
        })(member);

      return assemble<
        Schema.Struct<More>,
        readonly [Schema.Struct<More>, ...Upgrade<Prev["members"], Schema.Struct<More>, RD>]
      >(self, [self, ...previous.members.map(step)]);
    };
  },
  /**
   * Reads several versions at once — every version of `a` and of `b`, in one flat
   * union, so a rejected document reports all of them.
   */
  across<AMembers extends ReadonlyArray<Schema.Top>, BMembers extends ReadonlyArray<Schema.Top>>(
    a: Schema.Union<AMembers>,
    b: Schema.Union<BMembers>,
  ): Schema.Union<readonly [...AMembers, ...BMembers]> {
    return Schema.Union([...a.members, ...b.members]);
  },
};
