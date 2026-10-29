/**
 * Versioned extras on prompt, response, and session parts.
 *
 * {@link Extra} declares schemas by part kind.
 * {@link ExtraRecord} decodes declared fields and {@link stated} selects fields without decoding.
 * {@link ExtraKitSchema} states the declarations as a stored header holds them.
 *
 * @stability stable
 */

import { Data, Schema } from "effect";

import type * as ExtraKit from "#/ExtraKit.ts";
import { documentOf } from "#/internal/schema.ts";
import { PackageMetadata } from "#/Package.ts";
import { SchemaDocument } from "#/Toolkit.ts";

/**
 * The trajectory part kinds supporting extras.
 *
 * @see {@link Extra} for per-kind schemas.
 * @stability stable
 * @category models
 */
export type Part = "prompt" | "response" | "session";

type Fields<
  Pkg extends string,
  Id extends string,
  Prompt extends Schema.Top = never,
  Response extends Schema.Top = never,
  Session extends Schema.Top = never,
> = {
  packageName: Pkg;
  id: Id;
  name?: string;
  description?: string;
  packageMetadata?: PackageMetadata;
  prompt?: Prompt;
  response?: Response;
  session?: Session;
};

/**
 * An extra declaration with a separate schema for each supported part kind.
 *
 * **Details**
 *
 * `tag` joins `packageName` and `id` with `/`.
 * Extra records use this tag as the field name.
 * An omitted schema leaves that part kind unsupported.
 * Schemas built with `VersionedSchema.make` read historical data.
 * `packageMetadata` is what the declaring package states of itself.
 *
 * @see {@link make} for building a declaration from its fields.
 * @see {@link makeUnknown} for an extra named without its schemas.
 * @see {@link ExtraKit.make} for collecting declarations.
 * @see {@link ExtraRecord} for decoding their fields.
 * @stability stable
 * @category models
 */
export class Extra<
  Pkg extends string,
  Id extends string,
  Prompt extends Schema.Top = never,
  Response extends Schema.Top = never,
  Session extends Schema.Top = never,
> extends Data.Class<Fields<Pkg, Id, Prompt, Response, Session>> {
  get tag(): `${Pkg}/${Id}` {
    return `${this.packageName}/${this.id}`;
  }
}

/**
 * An {@link Extra} without specific identity or payload types.
 *
 * @stability stable
 * @category utility types
 */
export type Any = Extra<string, string, Schema.Top, Schema.Top, Schema.Top>;

/**
 * Creates an extra declaration from the fields it states.
 *
 * **Details**
 *
 * `name`, `description`, and `packageMetadata` are optional.
 * A part kind the fields state no schema for stays unsupported.
 *
 * @see {@link makeUnknown} for an extra named without its schemas.
 * @see {@link Extra} for the declaration those fields make.
 * @stability stable
 * @category constructors
 */
export const make = <
  Pkg extends string,
  Id extends string,
  Prompt extends Schema.Top = never,
  Response extends Schema.Top = never,
  Session extends Schema.Top = never,
>(
  fields: Fields<Pkg, Id, Prompt, Response, Session>,
): Extra<Pkg, Id, Prompt, Response, Session> => new Extra(fields);

/**
 * Declares an extra whose schemas accept any data on every part kind.
 *
 * **When to use**
 *
 * Use where a kit names an extra whose schemas the caller does not hold.
 *
 * **Details**
 *
 * Every part kind is supported, so no extra field is checked.
 *
 * @see {@link make} for a declaration with its schemas.
 * @see {@link ExtraKit.make} for collecting declarations.
 * @stability stable
 * @category constructors
 */
export const makeUnknown = <Pkg extends string, Id extends string>(
  packageName: Pkg,
  id: Id,
): Extra<Pkg, Id, typeof Schema.Unknown, typeof Schema.Unknown, typeof Schema.Unknown> =>
  make({
    packageName,
    id,
    prompt: Schema.Unknown,
    response: Schema.Unknown,
    session: Schema.Unknown,
  });

/**
 * Schema for a stored extra declaration.
 *
 * **Details**
 *
 * The declaration states the package it is in and the schemas it declares.
 * The optional name and description sit under `metadata`, as event and metric declarations
 * state them.
 * Each schema it declares is stored as a {@link SchemaDocument} of the versions it accepts.
 *
 * @see {@link encode} for serializing a kit.
 * @see {@link ExtraKitSchema} for the record a stored header holds.
 * @stability stable
 * @category schemas
 */
export const ExtraSchema = Schema.Struct({
  metadata: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      description: Schema.optional(Schema.String),
    }),
  ),
  packageMetadata: Schema.optional(PackageMetadata),
  prompt: Schema.optional(SchemaDocument),
  response: Schema.optional(SchemaDocument),
  session: Schema.optional(SchemaDocument),
});

/**
 * A stored extra declaration without its decoding schemas.
 *
 * @see {@link ExtraSchema} for the schema.
 * @stability stable
 * @category models
 */
export type ExtraSchema = Schema.Schema.Type<typeof ExtraSchema>;

/**
 * Schema for the stored extra declarations of a kit, keyed by tag.
 *
 * @see {@link ExtraSchema} for each declaration.
 * @stability stable
 * @category schemas
 */
export const ExtraKitSchema = Schema.Record(Schema.String, ExtraSchema);

/**
 * Stored extra declarations keyed by their kit tags.
 *
 * @see {@link ExtraKitSchema} for the schema.
 * @stability stable
 * @category models
 */
export type ExtraKitSchema = Schema.Schema.Type<typeof ExtraKitSchema>;

/**
 * Converts an extra kit into its stored declarations.
 *
 * **When to use**
 *
 * Use to describe the extra data of a kit without its decoding schemas.
 *
 * **Details**
 *
 * Record keys are the tags of the kit.
 * A declaration that states no name or description states no `metadata`.
 * A part kind the declaration states no schema for stays absent.
 * Each stated schema becomes a {@link SchemaDocument} of the versions it accepts.
 *
 * **Gotchas**
 *
 * Building a document can throw for a schema it cannot state.
 * The result states the encoded side, not the decoding transformations.
 *
 * @see {@link ExtraKitSchema} for the stored representation.
 * @stability stable
 * @category encoding
 */
export const encode = (kit: ExtraKit.Any): ExtraKitSchema =>
  Object.fromEntries(
    Object.entries(kit.extra).map(([tag, extra]) => [
      tag,
      {
        metadata: metadataOf(extra),
        packageMetadata: extra.packageMetadata,
        prompt: documentFor(extra, "prompt"),
        response: documentFor(extra, "response"),
        session: documentFor(extra, "session"),
      },
    ]),
  );

const metadataOf = (item: Any): { name?: string; description?: string } | undefined =>
  item.name === undefined && item.description === undefined
    ? undefined
    : { name: item.name, description: item.description };

type Declared<X extends Any, P extends Part> = Exclude<X[P], undefined>;

const declaredFor = (item: Any, part: Part): Schema.Top | undefined =>
  ({ prompt: item.prompt, response: item.response, session: item.session })[part];

const documentFor = (item: Any, part: Part): SchemaDocument | undefined => {
  const schema = declaredFor(item, part);

  return schema === undefined ? undefined : documentOf(schema);
};

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
