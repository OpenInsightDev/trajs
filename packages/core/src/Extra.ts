/**
 * Versioned extras on prompt, response, and session parts.
 *
 * {@link Extra} declares schemas by part kind.
 * {@link ExtraRecord} decodes declared fields and {@link stated} selects fields without decoding.
 *
 * @stability stable
 */

import { Data, Schema } from "effect";

import type * as ExtraKit from "#/ExtraKit.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/**
 * The trajectory part kinds supporting extras.
 *
 * @see {@link Extra} for per-kind schemas.
 * @stability stable
 * @category models
 */
export type Part = "prompt" | "response" | "session";

/**
 * An extra declaration with a separate versioned schema for each supported part kind.
 *
 * **Details**
 *
 * `tag` joins `package` and `id` with `/`.
 * Extra records use this tag as the field name.
 * An omitted schema leaves that part kind unsupported.
 *
 * @see {@link ExtraKit.make} for collecting declarations.
 * @see {@link ExtraRecord} for decoding their fields.
 * @stability stable
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

/**
 * An {@link Extra} without specific identity or payload types.
 *
 * @stability stable
 * @category utility types
 */
export type Any = Extra<
  string,
  string,
  VersionedSchema.Any,
  VersionedSchema.Any,
  VersionedSchema.Any
>;

type Declared<X extends Any, P extends Part> = Exclude<X[P], undefined>;

const declaredFor = (item: Any, part: Part): VersionedSchema.Any | undefined =>
  ({ prompt: item.prompt, response: item.response, session: item.session })[part];

type Datum<X extends Any, P extends Part> = [Declared<X, P>] extends [never]
  ? never
  : Schema.Schema.Type<Declared<X, P>>;

type DatumEncoded<X extends Any, P extends Part> = [Declared<X, P>] extends [never]
  ? never
  : Schema.Codec.Encoded<Declared<X, P>>;

/**
 * Schema for extra fields before selecting or decoding declarations.
 *
 * **Gotchas**
 *
 * Values stay unknown.
 * This schema does not validate declared extra payloads.
 *
 * @see {@link ExtraRecord} for declared payload schemas.
 * @stability stable
 * @category schemas
 */
export const Held = Schema.Record(Schema.String, Schema.Unknown);

/**
 * Extra fields without declared payload types.
 *
 * @see {@link Held} for the schema.
 * @stability stable
 * @category models
 */
export type Held = Schema.Schema.Type<typeof Held>;

/**
 * Optional decoded extra fields for one part kind.
 *
 * **Details**
 *
 * A declaration without a schema for `P` contributes no usable value.
 *
 * @see {@link ExtraRecord} for the schema.
 * @see {@link ExtraRecordEncoded} for the wire form.
 * @stability stable
 * @category models
 */
export type ExtraRecord<Extras extends Record<string, Any>, P extends Part> = {
  readonly [Tag in keyof Extras]?: Datum<Extras[Tag], P>;
};

/**
 * Optional encoded extra fields for one part kind.
 *
 * @see {@link ExtraRecord} for decoded fields.
 * @stability stable
 * @category encoding
 */
export type ExtraRecordEncoded<Extras extends Record<string, Any>, P extends Part> = {
  readonly [Tag in keyof Extras]?: DatumEncoded<Extras[Tag], P>;
};

/**
 * Creates a schema for the extras declared for `part` by `kit`.
 *
 * **Details**
 *
 * Every declared field is optional and keyed by its declaration's tag.
 * Declarations without a schema for `part` add no field.
 *
 * @see {@link stated} for selection without validation or migration.
 * @see {@link ExtraRecordEncoded} for the wire form.
 * @stability stable
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
 * Selects own fields declared for `part` by `kit`.
 *
 * **When to use**
 *
 * Use to separate declared extras from other options in an already decoded record.
 *
 * **Gotchas**
 *
 * Values are copied without validation or migration.
 * Undeclared fields and inherited properties are omitted.
 *
 * @see {@link ExtraRecord} for decoding and migration.
 * @stability stable
 * @category filtering
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
