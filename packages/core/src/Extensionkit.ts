/**
 * Collects the extensions a trajectory is recorded with into one set.
 *
 * A trajectory records the data formats it carries alongside its parts, so the
 * data can be versioned, validated and queried instead of being read as an untyped
 * bag. Extensions are collected here as a mapping from identifier to the schema of
 * the data, exactly as tools are collected into a toolkit: {@link make} builds the
 * set, {@link merge} combines the sets of several producers, and a reader picks the
 * schema of the extension it is reading by looking its identifier up.
 *
 * The set is also what names the extension a datum came from: {@link Part} builds
 * the part of one extension, discriminated by the identifier its data was
 * recorded for, and {@link PartView} reads a recording that carries extensions
 * the set does not hold. {@link extkits} binds a recorded trajectory to the
 * extensions it carries data for, the way a toolkit is bound to the tools a
 * recording names.
 */

import { Effect, JsonSchema, Match, Predicate, Schema, Stream } from "effect";
import type { Tool } from "effect/ai";
import type * as Extension from "#/Extension.ts";
import type * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

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
 * The identifiers any of the sets in a list holds.
 *
 * The sets are distributed over, because `keyof` of a union is only the keys every
 * member shares, which would drop the identifier a set alone holds.
 */
type MergedKeys<Kits extends ReadonlyArray<Record<string, AnyVersion>>> =
  Kits[number] extends infer Kit
    ? Kit extends Record<string, AnyVersion>
      ? keyof Kit
      : never
    : never;

/**
 * The schemas the sets of a list hold for one identifier, read from the sets that
 * hold it.
 */
type MergedSchemas<
  Kits extends ReadonlyArray<Record<string, AnyVersion>>,
  Key extends PropertyKey,
> = Kits[number] extends infer Kit
  ? Kit extends Record<string, AnyVersion>
    ? Key extends keyof Kit
      ? Kit[Key]
      : never
    : never
  : never;

/**
 * The set a list of sets merges to.
 *
 * @category models
 */
export type Merged<Kits extends ReadonlyArray<Record<string, AnyVersion>>> = {
  readonly [Key in MergedKeys<Kits>]: MergedSchemas<Kits, Key>;
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

/**
 * Serialized form of an extension kit, keyed by the identifiers of its
 * extensions.
 *
 * **When to use**
 *
 * Use to persist the data formats a recording carries, or to describe them to a
 * reader that does not have the extensions themselves.
 *
 * **Details**
 *
 * Each value is the draft-07 JSON Schema document of an extension's line of
 * versions, so the data an extension reads can be described without the Effect
 * Schemas the line was built from. The document is the whole line: every version
 * the extension's newest one reads is a member of it, so data recorded against
 * an older version is described as well.
 *
 * @see {@link encode} for serializing an extension kit.
 * @category models
 */
export type ExtensionkitEncoded = Record<string, JsonSchema.Document<"draft-07">>;

/**
 * Serializes an extension kit into an {@link ExtensionkitEncoded} record.
 *
 * **When to use**
 *
 * Use to persist the data formats a recording carries, or to describe them to a
 * reader that does not have the extensions themselves.
 *
 * **Details**
 *
 * Each extension contributes the draft-07 JSON Schema document of its line of
 * versions, keyed by the identifier its data was recorded for. Descriptive
 * metadata is not part of the set, so it is not part of the encoded form either;
 * read it from the extension that was declared.
 *
 * @category encoding
 */
export const encode = (extkit: Any): ExtensionkitEncoded =>
  Object.fromEntries(
    Object.entries(extkit).map(([id, version]) => [
      id,
      JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(version)),
    ]),
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
  readonly [Id in keyof Exts]: ReturnType<typeof extensionPart<Id & string, Exts[Id]>>;
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
  Schema.Union(Object.entries(extkit).map(([id, version]) => extensionPart(id, version))) as any;

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

// SAFETY: `Schema.Union` widens the encoded and service type parameters of its members; the union of the two codecs is exactly the declared contract.
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
): Schema.Codec<
  Part<Exts> | AnyPart,
  PartEncoded<Exts> | Schema.Codec.Encoded<typeof AnyPart>,
  never,
  never
> => Schema.Union([Part(extkit), AnyPart]) as any;

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
 * import { Effect, Option, Schema, Stream } from "effect"
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
 * const rebound = await Effect.runPromise(
 *   Extensionkit.extkits(Extensionkit.make(otel))(recorded)
 * )
 *
 * Object.keys(rebound.extkit) // => ["dev.observerw.otel"]
 * ```
 *
 * @see {@link PartView} for reading the parts of a kit together with the ones it
 * does not hold.
 * @category combinators
 */
export const extkits = <Kits extends ReadonlyArray<Any>>(...kits: Kits) =>
  Effect.fn(
    <Tools extends Record<string, Tool.Any>, Exts extends Any, E, R>(
      trajectory: Trajectory.Trajectory<Tools, Exts, E, R>,
    ): Effect.Effect<
      Trajectory.Trajectory<Tools, Merged<readonly [Exts, ...Kits]>, E, R>,
      TrajectoryError
    > => {
      const { toolkit, metadata, extkit } = trajectory;

      const merged: Merged<readonly [Exts, ...Kits]> = merge(extkit, ...kits);

      const encode = Schema.encodeEffect(PartView(extkit));
      const decode = Schema.decodeUnknownEffect(PartView(merged));

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

      return Effect.succeed(Object.assign(parts, { toolkit, metadata, extkit: merged }));
    },
  );
