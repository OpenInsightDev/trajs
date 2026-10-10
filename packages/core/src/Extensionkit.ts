/**
 * Collects the extensions a trajectory is recorded with into one set.
 *
 * A trajectory records the data formats it carries alongside its parts, so the
 * data can be versioned, validated and queried instead of being read as an untyped
 * bag. Extensions are collected here as a mapping from identifier to the extension
 * itself, exactly as tools are collected into a toolkit: {@link make} builds the
 * set, {@link merge} combines the sets of several producers, and a reader looks the
 * extension it is reading up by the identifier a datum was recorded for.
 *
 * The set is also what names the extension a datum came from: {@link Part} builds
 * the part of one extension, discriminated by the identifier its data was
 * recorded for, and {@link PartView} reads a recording that carries extensions
 * the set does not hold. {@link extkits} binds a recorded trajectory to the
 * extensions it carries data for, the way a toolkit is bound to the tools a
 * recording names.
 */

import { Effect, JsonSchema, Match, Predicate, Schema, Stream, Struct } from "effect";
import type { Tool } from "effect/ai";
import type * as Extension from "#/Extension.ts";
import type * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";
import type { JsonSchemaDocument } from "#/Toolkit.ts";

/**
 * The extensions a trajectory carries, keyed by identifier.
 *
 * **When to use**
 *
 * Use as the type of the extensions a trajectory is recorded with, or of the
 * extensions a function reads extension data by.
 *
 * **Details**
 *
 * Each value is an {@link Extension.Extension}, so the set names the extension a
 * datum came from and holds the line of versions that reads the datum. Descriptive
 * metadata is part of the extension, so it travels with the set.
 *
 * @see {@link Extension.Extension} for defining an extension.
 * @category models
 */
export type Extensionkit<
  Exts extends Record<string, Extension.Any> = Record<string, Extension.Any>,
> = Readonly<Exts>;

/**
 * A set of extensions of unknown identifiers and data.
 *
 * @category models
 */
export type Any = Extensionkit<Record<string, Extension.Any>>;

/**
 * The set a list of extensions yields, keyed by identifier.
 *
 * @category models
 */
export type Of<Exts extends ReadonlyArray<Extension.Any>> = {
  readonly [Ext in Exts[number] as Ext["id"]]: Ext;
};

/**
 * The extensions the sets of a list hold, read from the sets that hold them.
 *
 * The sets are distributed over, because `keyof` of a union is only the keys every
 * member shares, which would drop the identifier a set alone holds. Effect's own
 * `MergeRecords` does the same for a toolkit, but reads the tool out of each
 * member, so it cannot be reused for extensions.
 */
type MergeRecords<Kits> = {
  readonly [Id in Extract<Kits extends unknown ? keyof Kits : never, string>]: Extract<
    Kits extends Record<Id, infer Ext> ? Ext : never,
    Extension.Any
  >;
};

/**
 * The set a list of sets merges to.
 *
 * @category models
 */
export type Merged<Kits extends ReadonlyArray<Any>> = Struct.Simplify<MergeRecords<Kits[number]>>;

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
): Extensionkit<Of<Exts>> =>
  Object.fromEntries(extensions.map((extension) => [extension.id, extension])) as Extensionkit<
    Of<Exts>
  >;

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
export const merge = <const Kits extends ReadonlyArray<Any>>(
  ...kits: Kits
): Extensionkit<Merged<Kits>> => Object.assign({}, ...kits) as Extensionkit<Merged<Kits>>;

/**
 * Serialized form of a single extension.
 *
 * **When to use**
 *
 * Use to persist an extension, or to describe it to a reader that does not have
 * the extension itself.
 *
 * **Details**
 *
 * The line of versions is stored as the draft-07 JSON Schema document of its
 * newest version, so the data the extension reads can be described without the
 * Effect Schemas the line was built from. The document is the whole line: every
 * version the newest one reads is a member of it, so data recorded against an
 * older version is described as well. The descriptive metadata is carried
 * alongside, as a tool's name and description are.
 *
 * @see {@link ExtensionkitEncoded} for the record an extension kit serializes to.
 * @category models
 */
export type ExtensionEncoded = Readonly<{
  name?: string;
  description?: string;
  schema: JsonSchemaDocument;
}>;

/**
 * Serialized form of an extension kit, keyed by the identifiers of its
 * extensions.
 *
 * **When to use**
 *
 * Use to persist the extensions a recording carries, or to describe them to a
 * reader that does not have them.
 *
 * @see {@link encode} for serializing an extension kit.
 * @category models
 */
export type ExtensionkitEncoded = Record<string, ExtensionEncoded>;

/**
 * Serializes an extension kit into an {@link ExtensionkitEncoded} record.
 *
 * **When to use**
 *
 * Use to persist the extensions a recording carries, or to describe them to a
 * reader that does not have them.
 *
 * **Details**
 *
 * Each extension contributes the draft-07 JSON Schema document of its line of
 * versions and its descriptive metadata, keyed by the identifier its data was
 * recorded for, the way a toolkit's encoded form keeps each tool's name and
 * description.
 *
 * @category encoding
 */
export const encode = (extkit: Any): ExtensionkitEncoded =>
  Object.fromEntries(
    Object.entries(extkit).map(([id, extension]) => {
      const { name, description } = extension.metadata;

      const encoded = {
        schema: JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(extension.version)),
      };

      const named = name === undefined ? encoded : { ...encoded, name };
      const described = description === undefined ? named : { ...named, description };

      return [id, described];
    }),
  );

/**
 * One member of the parts an extension kit describes: the extension it belongs
 * to, and its data.
 *
 * The identifier is recorded as a literal rather than as a string, so the data
 * of each extension is discriminated by the extension it came from, the way a
 * tool call is discriminated by the name of its tool.
 */
const extensionPart = <Id extends string, V extends Schema.Top>(id: Id, version: V) =>
  Schema.Struct({
    extension: Schema.Literal(id),
    data: version,
  });

/**
 * The members of {@link Part}: the Schema of one part per extension of the kit,
 * keyed by the identifier the data was recorded for.
 *
 * The walk is what loses the kit's identifiers and schemas, so this is what the
 * members are declared to be rather than what the walk can write down.
 */
type Parts<Exts extends Any> = {
  readonly [Id in keyof Exts]: ReturnType<typeof extensionPart<Id & string, Exts[Id]["version"]>>;
}[keyof Exts];

/**
 * A part of an extension kit: the data of one extension, discriminated by the
 * identifier the data was recorded for.
 *
 * **When to use**
 *
 * Use when reading or matching on the data an extension kit describes.
 *
 * @see {@link Part} for the Schema that builds one.
 * @category models
 */
export type Part<Exts extends Any> = Schema.Schema.Type<Schema.Union<ReadonlyArray<Parts<Exts>>>>;

/**
 * Encoded representation of extension parts for serialization.
 *
 * @category models
 */
export type PartEncoded<Exts extends Any> = Schema.Codec.Encoded<
  Schema.Union<ReadonlyArray<Parts<Exts>>>
>;

// SAFETY: `Part` builds each member from the entry it came from, so the members are the kit's own schemas; the walk is what loses their types, not the union.
/**
 * Creates a Schema for the parts an extension kit describes.
 *
 * **When to use**
 *
 * Use when reading the data an extension kit describes, or when a recording
 * carries that data in parts of its own.
 *
 * **Details**
 *
 * One part is carried per extension of the kit, discriminated by the identifier
 * the data was recorded for: `extension` names the extension and `data` is its
 * data, read by that extension's own line of versions, so data recorded against
 * any version of it is read as the newest one.
 *
 * A part carries the data of its extension and nothing of the recording it ends
 * up in: what a recording tags, timestamps and identifies its parts with is
 * declared where the parts of a recording are.
 *
 * **Example** (Reading the data of an extension)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension, Extensionkit } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.observerw.otel",
 *   Extension.Metadata.make({}),
 *   Extension.Versions.make(Schema.Struct({
 *     version: Schema.Literal("1.0.0"),
 *     spanId: Schema.String
 *   }))
 * )
 *
 * const parts = Extensionkit.Part(Extensionkit.make(otel))
 * const part = Schema.decodeUnknownSync(parts)({
 *   extension: "dev.observerw.otel",
 *   data: { version: "1.0.0", spanId: "s1" }
 * })
 * part.extension // => "dev.observerw.otel"
 * ```
 *
 * @see {@link make} for collecting extensions into a set.
 * @category constructors
 */
export const Part = <Exts extends Any>(
  extkit: Exts,
): Schema.Codec<Part<Exts>, PartEncoded<Exts>, never, never> =>
  Schema.Union(
    Object.entries(extkit).map(([id, extension]) => extensionPart(id, extension.version)),
  ) as any;

const AnyPartTypeId = "~trajs/Extensionkit/AnyPart" as const;

/**
 * A part of an extension a kit does not describe.
 *
 * **When to use**
 *
 * Use when reading a recording that carries data for an extension the kit does
 * not hold, such as one a producer that declares extensions of its own wrote.
 *
 * **Details**
 *
 * The identifier is read as any string and the data as JSON, because nothing
 * describes them: no line of versions is at hand to check the data against, so
 * it is carried instead of being validated. A part read this way stays
 * distinguishable with {@link isAnyPart}, so a reader can tell data a line of
 * versions read from data a recording only carried along.
 *
 * @see {@link Part} for the part of an extension the kit describes.
 * @see {@link PartView} for reading both kinds in one schema.
 * @category models
 */
export type AnyPart = Schema.Schema.Type<typeof AnyPart>;

/**
 * Schema for the part of an extension a kit does not describe.
 *
 * **When to use**
 *
 * Use when a recording may carry data for extensions the kit does not hold.
 *
 * **Details**
 *
 * The identifier the data was recorded for is kept, so a reader can still tell
 * which extension the data belongs to and look that extension up in a kit that
 * holds it.
 *
 * @see {@link AnyPart} for the part this Schema reads.
 * @category schemas
 */
export const AnyPart = Schema.Struct({
  extension: Schema.String,
  data: Schema.Json,
  [AnyPartTypeId]: Schema.Literal(AnyPartTypeId).pipe(
    Schema.withConstructorDefault(Effect.succeed(AnyPartTypeId)),
    Schema.withDecodingDefaultKey(Effect.succeed(AnyPartTypeId), { encodingStrategy: "omit" }),
  ),
}).annotate({ identifier: "AnyPart" });

/**
 * Checks whether a part is one no extension of the kit describes.
 *
 * **When to use**
 *
 * Use to tell data a line of versions read from data a recording only carried
 * along.
 *
 * @category guards
 */
export const isAnyPart = (u: unknown): u is AnyPart => Predicate.hasProperty(u, AnyPartTypeId);

// SAFETY: `PartView` describes the parts of one kit and carries any other datum as
// `AnyPart`, so the union of the two codecs is the declared contract and its
// encoded form is the encoded form of that unconstrained part, whatever kit it is
// built from: the walk is what loses the kit's identifiers, not the encoded value.
/**
 * Creates a Schema for the parts an extension kit describes, including the
 * extensions it does not.
 *
 * **When to use**
 *
 * Use when decoding a recording that may carry data for extensions the kit does
 * not hold, and that data should be kept rather than rejected.
 *
 * **Details**
 *
 * The extensions of the kit are read as {@link Part} reads them, and any other
 * identifier as {@link AnyPart}: a datum the kit does not hold, and one whose
 * shape no version of its line accepts, is carried as JSON instead of failing
 * the whole recording.
 *
 * **Example** (Reading data for an extension the kit does not hold)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extensionkit } from "@trajs/core"
 *
 * const part = Schema.decodeUnknownSync(Extensionkit.PartView(Extensionkit.empty))({
 *   extension: "dev.observerw.otel",
 *   data: { version: "1.0.0", spanId: "s1" }
 * })
 * Extensionkit.isAnyPart(part) // => true
 * ```
 *
 * @see {@link Part} for the parts of the kit alone.
 * @category constructors
 */
export const PartView = <Exts extends Any>(
  extkit: Exts,
): Schema.Codec<Part<Exts> | AnyPart, Schema.Codec.Encoded<typeof AnyPart>, never, never> =>
  Schema.Union([Part(extkit), AnyPart]) as any;

/**
 * Extends a trajectory's extension kit with the given extension kits.
 *
 * **When to use**
 *
 * Use to bind a trajectory to the extensions it carries data for, such as one
 * recorded with `Extensionkit.empty` or with an older version of an extension.
 *
 * **Details**
 *
 * Every extension part is encoded with the trajectory's own kit and decoded again
 * with the merged one, so data recorded for an extension that was unknown, or for
 * an older version of it, regains the types of the extension's newest version.
 * Anything no extension matches stays {@link AnyPart}, the parts of every other
 * kind are carried over unchanged, and the toolkit, the metadata and the merged
 * kit travel with the returned trajectory. A schema failure is reported as a
 * {@link TrajectoryError} carrying the kit it happened with.
 *
 * **Example** (Binding a recording to its extensions)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema, Stream } from "effect"
 * import { Extension, Extensionkit, Trajectory } from "@trajs/core"
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
 * const recorded = Trajectory.make(
 *   Stream.make(Trajectory.AnyExtensionPart.make({
 *     extension: { extension: "dev.observerw.otel", data: { version: "1.0.0", spanId: "s1" } },
 *     attach: Option.none()
 *   }))
 * )
 *
 * const rebound = Extensionkit.extkits(Extensionkit.make(otel))(recorded)
 * Object.keys(rebound.extkit) // => ["dev.observerw.otel"]
 * ```
 *
 * @see {@link PartView} for reading the parts of a kit together with the ones it
 * does not hold.
 * @category combinators
 */
export const extkits =
  <Kits extends ReadonlyArray<Any>>(...kits: Kits) =>
  <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>, E, R>(
    trajectory: Trajectory.Trajectory<Tools, Exts, E, R>,
  ) => {
    const { toolkit, metadata, extkit } = trajectory;

    const merged = merge(extkit, ...kits);

    const encode = Schema.encodeEffect(PartView(extkit));
    const decode = Schema.decodeEffect(PartView(merged));

    const parts = trajectory.pipe(
      Stream.mapEffect((part) =>
        Match.value(part).pipe(
          Match.tag("Extension", (extension) =>
            Effect.gen(function* () {
              const encoded = yield* encode(extension.extension).pipe(
                Effect.mapError(TrajectoryError.encodeExtension(extkit)),
              );

              const decoded = yield* decode(encoded).pipe(
                Effect.mapError(TrajectoryError.decodeExtension(merged)),
              );

              return { ...extension, extension: decoded };
            }),
          ),
          Match.orElse((part) => Effect.succeed(part)),
        ),
      ),
    );

    return Object.assign(parts, { toolkit, metadata, extkit: merged });
  };
