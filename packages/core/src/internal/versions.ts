/**
 * Builds a line of document versions: a schema per version, and the readers that
 * accept any version up to a given one.
 *
 * A version is built from the version before it, and carries both halves of that
 * change in one declaration: the fields that make its shape, and the data mapping
 * that makes a value of it. It also carries the versions below it, so asking one
 * version for a reader is enough:
 *
 * ```ts
 * export const V1_5 = Schema.Struct({
 *   version: Schema.Literal("1.5"),
 *   url: Schema.URLFromString,
 * }).pipe(Versions.make);
 *
 * export const V1_6 = V1_5.pipe(
 *   Versions.upgrade(
 *     (fields) => ({ ...fields, version: Schema.Literal("1.6"), host: Schema.String }),
 *     {
 *       decode: SchemaGetter.transform((from) => ({ ...from, version: "1.6", host: from.url.hostname })),
 *     },
 *   ),
 * );
 *
 * Versions.upTo(V1_6); // v1.5 | v1.6 -> v1.6
 * Versions.upTo(V1_5); // v1.5 -> v1.5
 * Schema.encodeEffect(V1_6); // v1.6 -> v1.6
 * ```
 *
 * - `Versions.make` is the oldest version: a schema written out by hand, piped
 *   into it, with no upgrade into it. That is also how a version that is *not*
 *   forward compatible is written — there is nothing to declare, it just starts
 *   its own line.
 * - `Versions.upgrade(fields, change)` builds the next version: its fields and the
 *   data mapping that makes a value of it, in one place. The data mapping is
 *   checked against the shape the field mapping produced, so nothing drifts apart,
 *   and both carry the version literal — which is what tells the versions apart.
 * - `Versions.upTo(version)` is the reader for a version: it accepts every version
 *   up to it, and decodes them all to its value.
 * - `Versions.across(a, b)` reads several readers at once, keeping the versions
 *   distinct: the decoded value keeps its `version` tag, so a caller can tell
 *   which line a document came from.
 *
 * A version carries only its own step, and the reader is assembled the first time
 * it is read: `Versions.upTo` chains the version below, then the one below that,
 * and so on. So a line of N versions holds N steps, not one chain per version, and
 * only the readers that are actually asked for are built.
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

/** Extends a reader that already reaches a version, so that it starts one version lower. */
type Extend = (target: Schema.Top) => Schema.Top;

/** The line below a version: the step into it, and the version that step starts from. */
type Below = {
  readonly previous?: Below;
  readonly extend?: Extend;
};

/**
 * A version: its schema, plus the reader for every version up to it — itself
 * first (`on`), then each earlier version chained forward into it.
 *
 * `on` is built the first time it is read, by walking `extend` down the line.
 */
export type Version<
  Self extends Schema.Top,
  On extends ReadonlyArray<Schema.Top> = ReadonlyArray<Schema.Top>,
> = Self &
  Below & {
    readonly on: On;
  };

/**
 * Builds a version's reader: itself, then each version below it, chained forward
 * into it by the step that version holds.
 *
 * The overload carries the mapped tuple type, which a function body cannot write
 * down: the walk hands back an array, not a tuple. This is the same shape as
 * `Tuple.map` in Effect — a precise signature over a plain implementation.
 */
function reader<Next extends Schema.Top, Members extends ReadonlyArray<Schema.Top>, RD>(
  schema: Next,
  extend: Extend | undefined,
  previous: Below | undefined,
): [Next, ...Upgrade<Members, Next, RD>];
function reader(
  schema: Schema.Top,
  extend: Extend | undefined,
  previous: Below | undefined,
): ReadonlyArray<Schema.Top> {
  const members: Schema.Top[] = [schema];
  let target: Schema.Top = schema;
  let step = extend;
  let below = previous;

  while (step !== undefined) {
    target = step(target);
    members.push(target);
    step = below?.extend;
    below = below?.previous;
  }

  return members;
}

/**
 * Attaches a reader to a version's schema, built on first read and kept after.
 *
 * The overload carries the reader's type, which the getter's body cannot write
 * down, as `reader`.
 */
function attach<Self extends Schema.Top, On extends ReadonlyArray<Schema.Top>>(
  schema: Self,
  previous: Below,
  extend: Extend,
  read: () => On,
): Self &
  Below & {
    readonly on: On;
  };
function attach(
  schema: Schema.Top,
  previous: Below,
  extend: Extend,
  read: () => ReadonlyArray<Schema.Top>,
): Schema.Top {
  Object.defineProperty(schema, "on", {
    configurable: true,
    get() {
      const members = read();
      Object.defineProperty(schema, "on", { configurable: true, value: members });

      return members;
    },
  });

  return Object.assign(schema, { previous, extend });
}

/** The reader carried by a version, or just the schema when it carries none. */
type MembersOf<V extends Schema.Top> = V extends {
  readonly on: infer M extends ReadonlyArray<Schema.Top>;
}
  ? M
  : readonly [V];

/** Reads a version's reader. Overload plus a plain implementation, as `reader`. */
function membersOf<V extends Schema.Top>(version: V): MembersOf<V>;
function membersOf(
  version: Schema.Top & { readonly on?: ReadonlyArray<Schema.Top> },
): ReadonlyArray<Schema.Top> {
  return version.on ?? [version];
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
  ): Version<Self, ReadonlyArray<Self>> {
    return Object.assign(schema, { on: [schema] });
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
    Prev extends Schema.Struct<Schema.Struct.Fields>,
    Members extends ReadonlyArray<Schema.Top>,
    More extends Schema.Struct.Fields & { readonly version: Schema.Literal<string> },
    RD = never,
  >(
    fields: (previous: Prev["fields"]) => More,
    change: {
      /** Produces this version's encoded form, which its own schema then validates. */
      readonly decode: SchemaGetter.Getter<Schema.Struct<More>["Encoded"], Prev["Type"], RD>;
    },
  ) {
    return (previous: Prev & Version<Prev, Members>) => {
      const schema = previous.mapFields(fields);

      // The step is written against the version below, so the hop names both
      // ends: the target is whatever the reader has reached so far.
      const extend: Extend = (target) =>
        Schema.decodeTo<Schema.Top, Prev & Version<Prev, Members>, RD, never>(target, {
          decode: change.decode,
          encode: SchemaGetter.forbiddenEncoding,
        })(previous);

      return attach<
        Schema.Struct<More>,
        [Schema.Struct<More>, ...Upgrade<Members, Schema.Struct<More>, RD>]
      >(schema, previous, extend, () =>
        reader<Schema.Struct<More>, Members, RD>(schema, extend, previous),
      );
    };
  },
  /** Every version up to `version`, as one schema; it decodes them all to `version`. */
  upTo<V extends Schema.Top>(version: V) {
    return Schema.Union(membersOf(version));
  },
  /**
   * Reads several readers at once — every version of `a` and of `b`, in one flat
   * union, so a rejected document reports all of them.
   */
  across<AMembers extends ReadonlyArray<Schema.Top>, BMembers extends ReadonlyArray<Schema.Top>>(
    a: Schema.Union<AMembers>,
    b: Schema.Union<BMembers>,
  ): Schema.Union<readonly [...AMembers, ...BMembers]> {
    return Schema.Union([...a.members, ...b.members]);
  },
};
