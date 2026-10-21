/**
 * Extra data an extension states of a trajectory, and the record a part holds it
 * as.
 *
 * An {@link Extra} names one kind of extra data, with a schema for each of the
 * prompt, response and session parts it states; what it states of one part need not
 * be what it states of another, so it declares a schema for whichever parts it
 * states. {@link ExtraKit.make} and {@link ExtraKit.merge} collect extra data into
 * kits, and {@link ExtraRecord} reads a part's extra data as one kit declares it: the
 * kinds the kit declares a schema for on that part, keyed by tag, and nothing else.
 */

import { Data, Schema } from "effect";

import type * as ExtraKit from "#/ExtraKit.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/**
 * The part of a trajectory extra data is attached to: a datum's schema for
 * `prompt`, `response` or `session` reads what it states of a part of that kind.
 *
 * @see {@link Extra} for the schemas an extension declares.
 * @see {@link ExtraRecord} for the record one part holds.
 * @category models
 */
export type Part = "prompt" | "response" | "session";

/**
 * One kind of extra data an extension names.
 *
 * **When to use**
 *
 * Use to declare extra data an extension states of a trajectory, or to type one.
 *
 * **Details**
 *
 * `package` and `id` name it — `tag` is `"pkg/id"` — and `name` and `description`
 * describe it. `prompt`, `response` and `session` are the schemas it declares for those
 * parts, each at every version it was written at
 * ({@link VersionedSchema.VersionedSchema}); a kind need declare only the parts it
 * states. Collect extra data into a kit with {@link ExtraKit.make}.
 *
 * @see {@link ExtraKit.make} for collecting extra data into a kit.
 * @see {@link ExtraRecord} for reading a part's extra data.
 * @category models
 */
export class Extra<
  Pkg extends string,
  Id extends string,
  Prompt extends VersionedSchema.Any = never,
  Response extends VersionedSchema.Any = never,
  Session extends VersionedSchema.Any = never,
> extends Data.Class<{
  package: Pkg;
  id: Id;
  name?: string;
  description?: string;
  prompt?: Prompt;
  response?: Response;
  session?: Session;
}> {
  get tag(): `${Pkg}/${Id}` {
    return `${this.package}/${this.id}`;
  }
}

/** Extra data whose package, id and declared parts are not known. */
export type Any = Extra<
  string,
  string,
  VersionedSchema.Any,
  VersionedSchema.Any,
  VersionedSchema.Any
>;

/** What one tag of a kit holds on one part of a trajectory: the data of the schema the
/** The schema an extra declares for one part of a trajectory, and `never` where it declares none. */
type Declared<X extends Any, P extends Part> = Exclude<X[P], undefined>;

/** The schema a kit declares for one kind of extra data on one part of a trajectory, and `undefined` where it declares none there. */
const declaredFor = (item: Any, part: Part): VersionedSchema.Any | undefined =>
  ({ prompt: item.prompt, response: item.response, session: item.session })[part];

/**
 * What one tag of a kit holds on one part of a trajectory: the data of the schema the
 * kit declares for that part under it, and `never` where it declares none, so a part
 * cannot state a kind the kit declares for no part it is.
 */
type Datum<X extends Any, P extends Part> = [Declared<X, P>] extends [never]
  ? never
  : Schema.Schema.Type<Declared<X, P>>;

/** {@link Datum} as a trajectory is written. */
type DatumEncoded<X extends Any, P extends Part> = [Declared<X, P>] extends [never]
  ? never
  : Schema.Codec.Encoded<Declared<X, P>>;

/**
 * The extra data a part states of every kind, keyed by the tag of the kind each datum
 * is of, before the kit it is read with says what each kind of it is.
 *
 * **When to use**
 *
 * Use to type a value that holds a part's extra data beside other keys, or to take one
 * as {@link stated} takes it.
 *
 * @see {@link ExtraRecord} for the data of the kinds a kit declares of a part.
 * @category models
 */
export const Held = Schema.Record(Schema.String, Schema.Unknown);

/** {@link Held} as a part states it. */
export type Held = Schema.Schema.Type<typeof Held>;

/**
 * The extra data one part of a trajectory holds: the data of every kind of extra
 * data the kit declares a schema for on that part, keyed by the tag of the kind it
 * is the data of.
 *
 * **When to use**
 *
 * Use to type the `extra` field of a part, or to write one.
 *
 * **Details**
 *
 * - A tag the kit declares a schema for on this part holds that kind's data at the
 *   newest version of the schema: {@link ExtraRecord} reads the data of every version
 *   it was written at into that one.
 * - A tag the kit declares no schema for on this part — a kind it does not name, or
 *   one it declares for another part alone — is stated as `never`: the record holds
 *   no data of such a kind, so a part is not read as holding one, and a part written
 *   again does not state one.
 *
 * @see {@link ExtraRecord} for the schema that reads one.
 * @category models
 */
export type ExtraRecord<Extras extends Record<string, Any>, P extends Part> = {
  readonly [Tag in keyof Extras]?: Datum<Extras[Tag], P>;
};

/**
 * An {@link ExtraRecord} as it is encoded: the data of every kind the kit declares
 * a schema for on this part, at the version that schema writes.
 *
 * @see {@link ExtraRecord} for the record itself.
 * @category models
 */
export type ExtraRecordEncoded<Extras extends Record<string, Any>, P extends Part> = {
  readonly [Tag in keyof Extras]?: DatumEncoded<Extras[Tag], P>;
};

/**
 * Creates a Schema for the extra data one part of a trajectory holds, read as the
 * extra data a kit declares of the part it is.
 *
 * **When to use**
 *
 * Use for the `extra` field of a part, so that what a kit declares of a trajectory
 * is read as the data of that kind.
 *
 * **Details**
 *
 * - Every kind the kit declares a schema for on this part is read by it, keyed by
 *   its tag: a datum of any version reads as its newest one, as
 *   {@link VersionedSchema.VersionedSchema} reads one.
 * - A kind the kit declares no schema for on this part is no field of the record, so
 *   what a part states of it is not data the record holds. A kit that declares no
 *   kind at all for the part states no field, and a record of no field is read as it
 *   stands.
 * - A kind the kit declares a schema for on this part is read by it or not at all:
 *   a part whose datum no longer matches a version of that schema is not read as some
 *   other shape, which keeps a reader from acting on data it did not read.
 *
 * **Example** (Reading one kind on each part, and one the kit declares for no part)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extra, ExtraKit, VersionedSchema } from "@trajs/core"
 *
 * const estimate = new Extra.Extra({
 *   package: "tokenize",
 *   id: "estimate",
 *   name: "Token estimate",
 *   prompt: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make),
 *   response: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number,
 *     mediaTokens: Schema.Number
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const kit = ExtraKit.make(estimate)
 *
 * // A response part states how much of the count a payload that is not text priced
 * // as well, which a prompt part does not.
 * const onResponse = Schema.decodeUnknownSync(Extra.ExtraRecord(kit, "response"))({
 *   "tokenize/estimate": { version: "0.1.0", tokens: 3, mediaTokens: 0 }
 * })
 * onResponse["tokenize/estimate"]?.mediaTokens // => 0
 *
 * // A prompt part holds the count, which the kit declares for it, and nothing of a
 * // kind the kit declares for no part of a trajectory.
 * const onPrompt = Schema.decodeUnknownSync(Extra.ExtraRecord(kit, "prompt"))({
 *   "tokenize/estimate": { version: "0.1.0", tokens: 3 },
 *   "atif/step": { version: "0.1.0", index: 1 }
 * })
 * Object.keys(onPrompt) // => ["tokenize/estimate"]
 * ```
 *
 * @see {@link ExtraRecord} for the extra data it reads.
 * @see {@link Part} for the parts it reads one at a time.
 * @category schemas
 */
export const ExtraRecord = <K extends ExtraKit.Any, P extends Part>(
  kit: K,
  part: P,
): Schema.Codec<ExtraRecord<K["extra"], P>, ExtraRecordEncoded<K["extra"], P>> => {
  const fields: Record<string, Schema.Top> = {};

  for (const item of Object.values(kit.extra)) {
    const schema = declaredFor(item, part);

    if (schema !== undefined) {
      fields[item.tag] = Schema.optional(schema);
    }
  }

  // SAFETY: every field is one kind of extra data of the kit under the tag that kind
  // names, read by the schema the kit declares for the part the record is read for,
  // which is what `ExtraRecord` reads the extra data of a kit as.
  return Schema.Struct(fields) as any;
};

/**
 * The extra data a value states of one part of a trajectory, as the kit declares that
 * part: the data of every tag the kit declares for it, and nothing beside them.
 *
 * **When to use**
 *
 * Use to hold the extra data of a part beside the keys that name it, or to take the
 * extra data of a part as one kit declares it.
 *
 * **Details**
 *
 * - The data of a tag the kit declares for this part is held as the value states it,
 *   keyed by that tag: no schema reads it here, so a datum no schema of the kit states
 *   is held as it was written rather than failing as {@link ExtraRecord} would.
 * - What a value states of a tag the kit declares no schema for on this part is
 *   dropped, since a part holds the kinds the reading of it knows.
 *
 * @see {@link ExtraRecord} for the schema that reads a part as a kit declares it.
 * @category constructors
 */
export const stated =
  <K extends ExtraKit.Any, P extends Part>(kit: K, part: P) =>
  (held: Held): ExtraRecord<K["extra"], P> => {
    const declared: Array<[string, Held[string]]> = [];

    for (const item of Object.values(kit.extra)) {
      if (declaredFor(item, part) !== undefined && Object.hasOwn(held, item.tag)) {
        declared.push([item.tag, held[item.tag]]);
      }
    }

    // SAFETY: every entry is the data of one tag the kit declares for this part, under
    // that tag, which is what the record holds and all it holds; the tags of a kit are
    // not known one by one where the kit is a type parameter, so what the entries make
    // cannot be read as the record by type alone.
    return Object.fromEntries(declared) as ExtraRecord<K["extra"], P>;
  };
