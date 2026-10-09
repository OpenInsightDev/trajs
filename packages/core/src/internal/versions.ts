/**
 * Builds a line of document versions: a schema per version, each of which reads
 * every version up to it.
 *
 * `make` starts a line, `upgrade` derives the next version from the one before it
 * — its fields and the data mapping that makes a value of it, in one declaration
 * — and `across` reads several lines at once.
 */
import { Schema, SchemaGetter } from "effect";

/**
 * A step from `Prev` into `Next`: reads everything `Prev` reads, maps that value
 * into `Next`'s encoded form, and is validated by `Next`'s own shape.
 */
type Step<Prev extends Schema.Top, Next extends Schema.Top, RD> = Schema.decodeTo<
  Next,
  Prev,
  RD,
  never
>;

/**
 * A version: the reader that accepts every version up to it, and the shape it was
 * declared with as `self`.
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
 * Assembles a version from its own shape and the readers it accepts. The overload
 * carries the members as a tuple, which the array a caller builds cannot write down.
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
   * Builds a version from the version before it: the fields that make its shape,
   * and the data mapping that makes a value of it.
   *
   * `fields` is passed to `Schema.Struct.mapFields`, so it inherits the previous
   * version's fields unless it overrides or drops them. It is its own argument
   * rather than a field of `change`, so the compiler reads the previous version's
   * type off the pipe.
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
      readonly [Schema.Struct<More>, Step<Prev, Schema.Struct<More>, RD>]
    > => {
      const self = previous.self.mapFields(fields);

      // One step for the whole line below, whose source is the previous version's
      // reader: it already accepts every version up to that one, so a version costs
      // one step however long the line is.
      const step = Schema.decodeTo<Schema.Struct<More>, Prev, RD, never>(self, {
        decode: change.decode,
        encode: SchemaGetter.forbiddenEncoding,
      })(previous);

      return assemble<
        Schema.Struct<More>,
        readonly [Schema.Struct<More>, Step<Prev, Schema.Struct<More>, RD>]
      >(self, [self, step]);
    };
  },
  /**
   * Reads several versions at once: every version of `a` and of `b` in one union,
   * so a rejection reports both lines and a decoded value keeps its `version`.
   */
  across<AMembers extends ReadonlyArray<Schema.Top>, BMembers extends ReadonlyArray<Schema.Top>>(
    a: Schema.Union<AMembers>,
    b: Schema.Union<BMembers>,
  ): Schema.Union<readonly [...AMembers, ...BMembers]> {
    return Schema.Union([...a.members, ...b.members]);
  },
};
