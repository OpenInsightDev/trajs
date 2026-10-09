/**
 * Collects extension definitions into the set a trajectory is recorded with.
 *
 * A trajectory records the extension data formats it carries alongside its
 * parts, so the data can be versioned, validated and queried instead of being
 * read as an untyped bag. Extensions are collected here, keyed by their
 * identifier, exactly as tools are collected into a toolkit: {@link make} builds
 * the set, {@link encode} writes it to the header of a recording, the parts of
 * that recording are decoded with the definitions it was recorded against, and
 * data whose definition is missing degrades to an unconstrained part instead of
 * failing to load.
 */

import { JsonSchema, Schema } from "effect";
import type * as Extension from "#/Extension.ts";

/**
 * A set of extension definitions, keyed by their identifier.
 *
 * **When to use**
 *
 * Use as the type of the `extensions` field of a trajectory, or of the
 * definitions a function decodes with.
 *
 * @see {@link Extension.Extension} for defining an extension.
 * @category models
 */
export type Extensionkit<
  Exts extends Record<string, Extension.Any> = Record<string, Extension.Any>,
> = Readonly<Exts>;

/**
 * A set of extension definitions of unknown identifiers and data.
 *
 * @category models
 */
export type Any = Extensionkit;

/**
 * The set a list of extensions yields, keyed by identifier.
 *
 * @category models
 */
export type Of<Exts extends ReadonlyArray<Extension.Any>> = {
  readonly [Ext in Exts[number] as Ext["id"]]: Ext;
};

/**
 * The merged extension definitions of a list of kits.
 *
 * @category models
 */
export type Merged<Kits extends ReadonlyArray<Record<string, Extension.Any>>> = {
  readonly [Key in keyof Kits[number]]: Kits[number][Key];
};

/**
 * A set with no extension definitions.
 *
 * **When to use**
 *
 * Use as the definitions of a trajectory that carries no extension data, or as
 * the identity of {@link merge}.
 *
 * @category constructors
 */
export const empty: Extensionkit<Record<string, never>> = {};

// SAFETY: `make` derives its key and value types from a generic input whose
// precision `Object.fromEntries` erases.
/**
 * Collects extension definitions into a set, keyed by identifier.
 *
 * **When to use**
 *
 * Use when building the definitions a trajectory is recorded or decoded with.
 *
 * **Example** (Collecting definitions)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension, Extensionkit } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.trajs.otel",
 *   "1.0.0",
 *   Schema.Struct({ spanId: Schema.String })
 * )
 * Object.keys(Extensionkit.make(otel)) // => ["dev.trajs.otel"]
 * ```
 *
 * @category constructors
 */
export const make = <const Exts extends ReadonlyArray<Extension.Any>>(
  ...extensions: Exts
): Of<Exts> =>
  Object.fromEntries(extensions.map((extension) => [extension.id, extension])) as Of<Exts>;

// SAFETY: `merge` derives its key and value types from generic inputs whose
// precision `Object.assign` erases.
/**
 * Merges sets of extension definitions, later definitions overriding earlier
 * ones with the same identifier.
 *
 * **When to use**
 *
 * Use when a trajectory should carry the definitions of several producers.
 *
 * @see {@link make} for collecting definitions into a set.
 * @category combinators
 */
export const merge = <const Kits extends ReadonlyArray<Record<string, Extension.Any>>>(
  ...kits: Kits
): Merged<Kits> => Object.assign({}, ...kits) as Merged<Kits>;

/**
 * Serialized form of an extension definition, as stored in a trajectory header.
 *
 * **When to use**
 *
 * Use to describe a recorded extension to a consumer that does not have the
 * definition installed.
 *
 * **Details**
 *
 * The version is recorded verbatim and the schema is converted to a draft-07
 * JSON Schema document, so the shape of the data is readable without the Effect
 * Schema it was built from.
 *
 * @category models
 */
export type ExtensionEncoded = Readonly<{
  version: string;
  schema: JsonSchema.Document<"draft-07">;
}>;

/**
 * Serializes extension definitions into their encoded form.
 *
 * **When to use**
 *
 * Use when writing the header of a recorded trajectory.
 *
 * @category encoding
 */
export const encode = (extensions: Any): Record<string, ExtensionEncoded> =>
  Object.fromEntries(
    Object.entries(extensions).map(([id, extension]) => [
      id,
      {
        version: extension.version,
        schema: JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(extension.schema)),
      },
    ]),
  );
