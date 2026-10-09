/**
 * Collects the extensions a trajectory is recorded with into one set.
 *
 * A trajectory records the data formats it carries alongside its parts, so the
 * data can be versioned, validated and queried instead of being read as an untyped
 * bag. Extensions are collected here as a mapping from identifier to the schema of
 * the data, exactly as tools are collected into a toolkit: {@link make} builds the
 * set, {@link merge} combines the sets of several producers, and a reader picks the
 * schema of the extension it is reading by looking its identifier up.
 */

import type * as Extension from "#/Extension.ts";

/**
 * A version line of unknown shape: the schema a set holds for an identifier.
 */
type AnyVersion = Extension.Any["version"];

/**
 * The schemas of the extensions a trajectory carries, keyed by identifier.
 *
 * **When to use**
 *
 * Use as the type of the extensions a trajectory is recorded with, or of the
 * schemas a function reads extension data by.
 *
 * **Details**
 *
 * Each value is the `version` of an {@link Extension.Extension}: the schema that
 * reads the extension's data, whatever version of it was recorded. Descriptive
 * metadata is not part of the set, because nothing reads data by it; read it from
 * the extension that was declared.
 *
 * @see {@link Extension.Extension} for defining an extension.
 * @category models
 */
export type Extensionkit<Schemas extends Record<string, AnyVersion> = Record<string, AnyVersion>> =
  Readonly<Schemas>;

/**
 * A set of extensions of unknown identifiers and data.
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
  readonly [Ext in Exts[number] as Ext["id"]]: Ext["version"];
};

/**
 * The set a list of sets merges to.
 *
 * @category models
 */
export type Merged<Kits extends ReadonlyArray<Record<string, AnyVersion>>> = {
  readonly [Key in keyof Kits[number]]: Kits[number][Key];
};

/**
 * A set with no extensions.
 *
 * **When to use**
 *
 * Use as the extensions of a trajectory that carries no extension data, or as the
 * identity of {@link merge}.
 *
 * @category constructors
 */
export const empty: Extensionkit<{}> = {};

// SAFETY: `make` derives its key and value types from a generic input whose precision `Object.fromEntries` erases.
/**
 * Collects extensions into a set, keyed by identifier.
 *
 * **When to use**
 *
 * Use when building the extensions a trajectory is recorded or read with.
 *
 * **Example** (Collecting extensions)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension, Extensionkit } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.observerw.otel",
 *   Extension.Metadata.make({ name: "OpenTelemetry" }),
 *   Extension.Versions.make(Schema.Struct({
 *     version: Schema.Literal("1.0.0"),
 *     spanId: Schema.String
 *   }))
 * )
 *
 * const kit = Extensionkit.make(otel)
 * Object.keys(kit) // => ["dev.observerw.otel"]
 * ```
 *
 * @see {@link merge} for combining the sets of several producers.
 * @category constructors
 */
export const make = <const Exts extends ReadonlyArray<Extension.Any>>(
  ...extensions: Exts
): Of<Exts> =>
  Object.fromEntries(extensions.map((extension) => [extension.id, extension.version])) as Of<Exts>;

// SAFETY: `merge` derives its key and value types from generic inputs whose precision `Object.assign` erases.
/**
 * Merges sets of extensions, later sets overriding earlier ones with the same
 * identifier.
 *
 * **When to use**
 *
 * Use when a trajectory should carry the extensions of several producers.
 *
 * @see {@link make} for collecting extensions into a set.
 * @category combinators
 */
export const merge = <const Kits extends ReadonlyArray<Record<string, AnyVersion>>>(
  ...kits: Kits
): Merged<Kits> => Object.assign({}, ...kits) as Merged<Kits>;
