/**
 * Extra data an extension states of a trajectory, and the record a part holds it
 * as.
 *
 * An {@link Extra} is one kind of extra data an extension names, with the schema
 * of what a prompt part holds of it, the schema of what a response part holds of
 * it, and the schema of what a session part holds of it, each at every version it
 * was written at: what a datum states of one part need not be what it states of
 * another, and an extension declares the schema of whichever parts it states, or
 * of several. {@link makeKit} collects extra data into a kit, and
 * {@link ExtraRecord} reads the extra data a part holds as the extra data of that
 * kit for the part it is: the data of every kind the kit declares a schema for
 * there, keyed by its tag, and the data of the kinds it declares none for there as
 * it was written. A part is read through the kit it was recorded with for the same
 * reason a response part is read through the toolkit it was recorded with: the part
 * holds the data, and the kit is what says how to read it.
 */

import { Data, Schema } from "effect";

import * as VersionedSchema from "#/VersionedSchema.ts";

import type { IndexByKey } from "./internal/types.ts";

/**
 * The part of a recording extra data is attached to: what a datum states of a
 * prompt part is read by the schema an extension declares it with for `prompt`,
 * what one states of a response part by the schema it declares for `response`, and
 * what one states of a session part by the schema it declares for `session`.
 *
 * @see {@link Extra} for the schemas an extension declares.
 * @see {@link ExtraRecord} for the record one part holds.
 * @category models
 */
export type Part = "prompt" | "response" | "session";

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

export type Any = Extra<
  string,
  string,
  VersionedSchema.Any,
  VersionedSchema.Any,
  VersionedSchema.Any
>;

type ExtrasByTag<Xs> = IndexByKey<Xs, "tag">;

export type Extrakit<Extras extends Record<string, Any>> = Readonly<{
  extra: Extras;
}>;

export const makeKit = <Xs extends ReadonlyArray<Any>>(...extra: Xs) => {
  // SAFETY: every kind of extra data given is inserted under its own tag below, so
  // what the record holds is one kind per tag the kit names.
  const output = {} as Record<string, Any>;

  for (const item of extra) {
    output[item.tag] = item;
  }

  // SAFETY: `output` holds the extra data of every tag in `Xs`, which is what
  // `ExtrasByTag` reads the extra data given as.
  return { extra: output } as Extrakit<ExtrasByTag<Xs>>;
};

export type AnyKit = Extrakit<Record<string, Any>>;

/** The schema an extra declares for one part of a recording, and `never` where it declares none. */
type Declared<X extends Any, P extends Part> = Exclude<X[P], undefined>;

/** What a tag holds on one part of a recording, and `unknown` where the kit declares no schema for that tag there. */
type Datum<X extends Any, P extends Part> = [Declared<X, P>] extends [never]
  ? unknown
  : Schema.Schema.Type<Declared<X, P>>;

/** {@link Datum} as a recording is written. */
type DatumEncoded<X extends Any, P extends Part> = [Declared<X, P>] extends [never]
  ? unknown
  : Schema.Codec.Encoded<Declared<X, P>>;

/**
 * The extra data one part of a recording holds: the data of every kind of extra
 * data, keyed by the tag of the kind it is the data of.
 *
 * **When to use**
 *
 * Use to type the `extra` field of a part, or to write one.
 *
 * **Details**
 *
 * - A tag the kit declares a schema for on this part holds the data of that kind,
 *   at the newest version of that schema: {@link ExtraRecord} reads the data of
 *   every version it was written at into that one.
 * - A tag the kit declares no schema for on this part — a kind it does not name,
 *   or one it declares for another part alone — holds what it was written with,
 *   so a recording another kit wrote still reads, and so does a datum of a kind
 *   read on the part it was not declared for. Nothing is known of such a datum
 *   beyond its presence, which is why it is read as `unknown`.
 * - A tag the kit declares a schema for on this part whose data no longer matches
 *   a version of that schema is not read at all: the kit states how the data of
 *   the kinds it declares is written, and reading it another way would be reading
 *   it as something it is not.
 *
 * @see {@link ExtraRecord} for the schema that reads one.
 * @category models
 */
export type ExtraRecord<Extras extends Record<string, Any>, P extends Part> = {
  readonly [Tag in keyof Extras]?: Datum<Extras[Tag], P>;
} & { readonly [tag: string]: unknown }; // oxlint-disable-line anti-slop/no-unsafe-dictionary-type -- an undeclared tag holds what it was written with

/**
 * An {@link ExtraRecord} as it is encoded: the data of every kind the kit declares
 * a schema for on this part at the version that schema writes, and the data of the
 * kinds it declares none for as it was written.
 *
 * @see {@link ExtraRecord} for the record itself.
 * @category models
 */
export type ExtraRecordEncoded<Extras extends Record<string, Any>, P extends Part> = {
  readonly [Tag in keyof Extras]?: DatumEncoded<Extras[Tag], P>;
} & { readonly [tag: string]: unknown }; // oxlint-disable-line anti-slop/no-unsafe-dictionary-type -- an undeclared tag holds what it was written with

/**
 * Creates a Schema for the extra data one part of a recording holds, read as the
 * extra data a kit declares of the part it is.
 *
 * **When to use**
 *
 * Use for the `extra` field of a part, so that what a kit declares of a recording
 * is read as the data of that kind rather than as the data it was written with.
 *
 * **Details**
 *
 * - Every kind the kit declares a schema for on this part is read by it, keyed by
 *   its tag: a datum of any version of it reads as its newest one, as
 *   {@link VersionedSchema.VersionedSchema} reads one.
 * - A kind the kit declares no schema for on this part is carried through as it
 *   was read and as it is written, so re-writing a recording a kit wrote does not
 *   change it, and a kit reads a recording another kit wrote without knowing what
 *   it holds.
 * - A kind the kit declares a schema for on this part is read by it or not at all:
 *   a part whose datum no longer matches is not read as some other shape, which is
 *   what keeps a reader from acting on data it did not read.
 *
 * **Example** (Reading one kind on each part, and one declared for a part alone)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extra, VersionedSchema } from "@trajs/core"
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
 * const kit = Extra.makeKit(estimate)
 *
 * // A response part states how much of the count a payload that is not text priced
 * // as well, which a prompt part does not.
 * const onResponse = Schema.decodeUnknownSync(Extra.ExtraRecord(kit, "response"))({
 *   "tokenize/estimate": { version: "0.1.0", tokens: 3, mediaTokens: 0 }
 * })
 * onResponse["tokenize/estimate"]?.mediaTokens // => 0
 *
 * // The kit declares no schema for a prompt part of an event an extension records,
 * // so what one holds is left as it was written.
 * const onPrompt = Schema.decodeUnknownSync(Extra.ExtraRecord(kit, "prompt"))({
 *   "tokenize/estimate": { version: "0.1.0", tokens: 3, mediaTokens: 0 },
 *   "atif/step": { version: "0.1.0", index: 1 }
 * })
 * onPrompt["atif/step"] // => { version: "0.1.0", index: 1 }
 * ```
 *
 * @see {@link ExtraRecord} for the extra data it reads.
 * @see {@link Part} for the parts it reads one at a time.
 * @category schemas
 */
export const ExtraRecord = <K extends AnyKit, P extends Part>(
  kit: K,
  part: P,
): Schema.Codec<ExtraRecord<K["extra"], P>, ExtraRecordEncoded<K["extra"], P>> => {
  const fields: Record<string, Schema.Top> = {};

  for (const item of Object.values(kit.extra)) {
    const declared = { prompt: item.prompt, response: item.response, session: item.session }[part];

    if (declared !== undefined) {
      fields[item.tag] = Schema.optional(declared);
    }
  }

  // SAFETY: every field is one kind of extra data of the kit under the tag that
  // kind names, read by the schema the kit declares for the part the record is read
  // for, which is what `ExtraRecord` reads the extra data of a kit as; a tag the kit
  // declares no schema for there is left to the record the fields are read beside.
  return Schema.StructWithRest(Schema.Struct(fields), [
    Schema.Record(Schema.String, Schema.Unknown),
  ]) as any;
};
