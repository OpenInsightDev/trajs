import { Effect, Predicate, Schema, Stream } from "effect";

import * as Extension from "#/Extension.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A kit of extensions, keyed by the id each of them records its data under.
 *
 * **When to use**
 *
 * Use as the value a trajectory carries its extensions in, or to type the kit a
 * function is given.
 *
 * **Details**
 *
 * A kit holds its extensions rather than being them, so that they are only ever
 * read through {@link Extensions}: the record a kit's type argument names is the
 * extensions it holds, and one that is not known — {@link Any} — names none. Were
 * a kit its extensions, the record of a kit a function is only given as its type
 * parameter would be read through its constraint, the record of every extension
 * at all: every id derived from it would widen to `string`, and the data of every
 * part of one to `unknown`. `effect/ai`'s `Toolkit` holds its tools the same way,
 * for the same reason.
 *
 * @see {@link Extensions} for the extensions a kit holds.
 * @see {@link Any} for a kit that holds any extension at all.
 * @category models
 */
export interface Extensionkit<Exts extends Record<string, Extension.Any>> {
  readonly extensions: Exts;
}

/**
 * A kit that holds any extension at all, as a trajectory's kit is when nothing
 * is known of it.
 *
 * @see {@link Extensionkit} for what a kit holds.
 * @category models
 */
export type Any = Extensionkit<Record<string, Extension.Any>>;

/**
 * The extensions a kit holds, as the record they are keyed by.
 *
 * **When to use**
 *
 * Use to read the extensions of a kit that is not known by value — one taken as
 * the type parameter of a function, or the recorded kit of a trajectory.
 *
 * **Details**
 *
 * The record is read from a kit's type argument, so a kit read this way names
 * its own extensions where they are known — a kit passed to a function, or the
 * kit of a trajectory a function was given — and names none where they are not.
 * Reading a kit's extensions directly would be reading the constraint of the kit
 * instead, which is the record of every extension.
 *
 * @see {@link Extensionkit} for why a kit holds its extensions.
 * @category models
 */
export type Extensions<Extkit> = Extkit extends Extensionkit<infer Exts> ? Exts : never;

/**
 * A kit of the extensions given, keyed the way they are written.
 *
 * **When to use**
 *
 * Use to build the kit a trajectory is recorded with, or the kit
 * {@link toProducers} is given.
 *
 * **Details**
 *
 * The extensions are keyed by the ids they are written under, which are the ids
 * their data is recorded as and the way {@link DerivedPartView} tells their
 * parts apart, so the keys of the record are the ids of the kit.
 *
 * **Example** (Making a kit of the extensions to record)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension, Extensionkit, VersionedSchema } from "@trajs/core"
 *
 * const count = Extension.make(
 *   "org.js.tra.count",
 *   {
 *     metadata: Extension.Metadata.make({ name: "Part count" }),
 *     output: Schema.TaggedStruct(Extension.OutputTag, {
 *       version: Schema.Literal("0.1.0"),
 *       tokens: Schema.Number
 *     }).pipe(VersionedSchema.make),
 *     failure: Schema.TaggedStruct(Extension.FailureTag, {
 *       version: Schema.Literal("0.1.0"),
 *       reason: Schema.String
 *     }).pipe(VersionedSchema.make)
 *   }
 * )
 *
 * const kit = Extensionkit.make({ "org.js.tra.count": count })
 * Object.keys(kit.extensions) // => ["org.js.tra.count"]
 * ```
 *
 * @category constructors
 */
export const make = <Exts extends Record<string, Extension.Any>>(
  extensions: Exts,
): Extensionkit<Exts> => ({ extensions });

/**
 * A kit that holds no extension, as a recording that derives nothing of its
 * messages is written with.
 *
 * @see {@link make} for a kit of the extensions given.
 * @category constructors
 */
export const empty: Extensionkit<{}> = { extensions: {} };

const derivedPart = <Id extends string, Output extends Schema.Top, Failure extends Schema.Top>(
  id: Id,
  output: Output,
  failure: Failure,
) =>
  Schema.Struct({
    extension: Schema.Literal(id),
    data: Schema.Union([output, failure]),
  });

const systemPart = <Id extends string, System extends Schema.Top>(id: Id, system: System) =>
  Schema.Struct({
    system: Schema.Literal(id),
    data: system,
  });

type DerivedPartOf<
  Exts extends Record<string, Extension.Any>,
  Id extends keyof Exts,
> = Id extends string
  ? Extension.HasDerivation<Exts[Id]> extends true
    ? Readonly<{
        extension: Id;
        data: Extension.OutputSchema<Exts[Id]>["Type"] | Extension.FailureSchema<Exts[Id]>["Type"];
      }>
    : never
  : never;

/**
 * What one extension of a kit derived of a recording, named by the extension it
 * belongs to.
 *
 * **When to use**
 *
 * Use to type what a producer yields for an extension, or to read what one
 * derived of a recording.
 *
 * **Details**
 *
 * An extension that declares no derivation contributes no part of this kind, so
 * what it contributes to the union is `never`.
 *
 * @see {@link DerivedPartView} for it together with the fallback for an
 * extension the kit does not hold.
 * @category models
 */
export type DerivedPart<Exts extends Record<string, Extension.Any>> = DerivedPartOf<
  Exts,
  keyof Exts
>;

/** A {@link DerivedPart} as it is encoded.
 *
 * @see {@link DerivedPart} for the part it encodes.
 * @category models
 */
export type DerivedPartEncoded<Exts extends Record<string, Extension.Any>> = {
  readonly [Id in keyof Exts]: Readonly<
    Id extends string
      ? Extension.HasDerivation<Exts[Id]> extends true
        ? {
            extension: Id;
            data:
              | Schema.Codec.Encoded<Extension.OutputSchema<Exts[Id]>["Type"]>
              | Schema.Codec.Encoded<Extension.FailureSchema<Exts[Id]>["Type"]>;
          }
        : never
      : never
  >;
}[keyof Exts];

/**
 * Whether an extension derives data of a recording: the two schemas of a derivation
 * are declared as a pair, so one that declares none carries `Schema.Never` at what
 * it fails with — see {@link Extension.HasDerivation}.
 */
const derives = (extension: Extension.Any): boolean => extension.failureSchema !== Schema.Never;

/**
 * Creates the codec the data a kit's extensions derived is written and read with.
 *
 * The codec holds an entry for each extension of the kit that derives data, so what
 * a producer yields is read as the data of the extension it is keyed by. An
 * extension that declares no derivation contributes no entry: what a producer of
 * it yields is `Schema.Void`, which a part recorded of it cannot be told from one
 * carrying no data at all, so a part of that extension is left to the fallback an
 * unknown extension is read as — see {@link DerivedPartView}.
 *
 * @see {@link DerivedPartView} for the codec a trajectory part carries.
 * @category schemas
 */
export const DerivedPart = <Kit extends Any>(
  kit: Kit,
): Schema.Codec<
  DerivedPart<Extensions<Kit>>,
  DerivedPartEncoded<Extensions<Kit>>,
  never,
  never
> => {
  const members: Schema.Top[] = [];

  for (const [id, extension] of Object.entries(kit.extensions)) {
    if (derives(extension)) {
      members.push(derivedPart(id, extension.outputSchema, extension.failureSchema));
    }
  }

  // SAFETY: each entry's struct is the `DerivedPart<Extensions<Kit>>` member for
  // that key, so the union of them is the codec the return type names.
  return Schema.Union(members) as any;
};

const AnyDerivedPartTypeId = "~trajs/Extensionkit/AnyDerivedPart" as const;

/**
 * The data of an extension a kit does not hold, read as the JSON it was recorded
 * as.
 *
 * @see {@link DerivedPart} for the data of an extension the kit holds.
 * @category models
 */
export type AnyDerivedPart = Readonly<{
  extension: string;
  data: Schema.Json;
}>;

/** The codec an {@link AnyDerivedPart} is read with.
 *
 * @see {@link AnyDerivedPart} for the data it reads.
 * @category schemas
 */
export const AnyDerivedPart = Schema.Struct({
  extension: Schema.String,
  data: Schema.Json,
  [AnyDerivedPartTypeId]: Schema.Literal(AnyDerivedPartTypeId).pipe(
    Schema.withConstructorDefault(Effect.succeed(AnyDerivedPartTypeId)),
    Schema.withDecodingDefaultKey(Effect.succeed(AnyDerivedPartTypeId), {
      encodingStrategy: "omit",
    }),
  ),
});

/** An {@link AnyDerivedPart} as it is encoded.
 *
 * @see {@link AnyDerivedPart} for the data it encodes.
 * @category models
 */
export type AnyDerivedPartEncoded = DerivedPartEncoded<Record<string, Extension.Any>> & {
  [AnyDerivedPartTypeId]: typeof AnyDerivedPartTypeId;
};

/** Whether a value is the data of an extension the kit does not hold.
 *
 * @see {@link AnyDerivedPart} for the data it recognises.
 * @category guards
 */
export const isAnyDerivedPart = (u: unknown): u is AnyDerivedPart =>
  Predicate.hasProperty(u, AnyDerivedPartTypeId);

/**
 * Creates the codec the data derived of a recording is read with, whatever the
 * kit that recorded it.
 *
 * **When to use**
 *
 * Use as the payload of a trajectory part that carries derived data, so that a
 * recording read with a kit it was not written with still reads.
 *
 * **Details**
 *
 * The kit's own data is read as the data of the extension that declared it, and
 * the data of an extension the kit does not hold as the JSON it was recorded as
 * — see {@link AnyDerivedPart}.
 *
 * @see {@link DerivedPart} for the data of a kit's own extensions.
 * @category schemas
 */
export const DerivedPartView = <Kit extends Any>(
  kit: Kit,
): Schema.Codec<
  DerivedPart<Extensions<Kit>> | AnyDerivedPart,
  AnyDerivedPartEncoded,
  never,
  never
> =>
  // SAFETY: `DerivedPartView` is the kit's parts together with the
  // `AnyDerivedPart` fallback, which is what the union encodes.
  Schema.Union([DerivedPart(kit), AnyDerivedPart]) as any;

/**
 * A {@link DerivedPartView} as a type.
 *
 * @see {@link DerivedPartView} for the codec it names.
 * @category models
 */
export type DerivedPartView<Exts extends Record<string, Extension.Any>> = Readonly<
  DerivedPart<Exts> | AnyDerivedPart
>;

type SystemPartOf<
  Exts extends Record<string, Extension.Any>,
  Id extends keyof Exts,
> = Id extends string
  ? Extension.HasSystemSchema<Exts[Id]> extends true
    ? Readonly<{ system: Id; data: Extension.SystemSchema<Exts[Id]>["Type"] }>
    : never
  : never;

/**
 * What one extension of a kit records of a run as a system event, named by the
 * extension it belongs to.
 *
 * **When to use**
 *
 * Use to type what an extension records as a {@link Trajectory.SystemPart}, or
 * to read one back.
 *
 * **Details**
 *
 * An extension that declares no system event contributes no part of this kind,
 * so what it contributes to the union is `never`.
 *
 * @see {@link SystemPartView} for it together with the fallback for an extension
 * the kit does not hold.
 * @category models
 */
export type SystemPart<Exts extends Record<string, Extension.Any>> = SystemPartOf<Exts, keyof Exts>;

/** A {@link SystemPart} as it is encoded.
 *
 * @see {@link SystemPart} for the part it encodes.
 * @category models
 */
export type SystemPartEncoded<Exts extends Record<string, Extension.Any>> = {
  readonly [Id in keyof Exts]: Readonly<
    Id extends string
      ? Extension.HasSystemSchema<Exts[Id]> extends true
        ? { system: Id; data: Schema.Codec.Encoded<Extension.SystemSchema<Exts[Id]>["Type"]> }
        : never
      : never
  >;
}[keyof Exts];

const AnySystemPartTypeId = "~trajs/Extensionkit/AnySystemPart" as const;

/**
 * A system event of an extension a kit does not hold, read as the JSON it was
 * recorded as.
 *
 * @see {@link SystemPart} for an event of an extension the kit holds.
 * @category models
 */
export type AnySystemPart = Readonly<{
  system: string;
  data: Schema.Json;
}>;

/** The codec an {@link AnySystemPart} is read with.
 *
 * @see {@link AnySystemPart} for the event it reads.
 * @category schemas
 */
export const AnySystemPart = Schema.Struct({
  system: Schema.String,
  data: Schema.Json,
  [AnySystemPartTypeId]: Schema.Literal(AnySystemPartTypeId).pipe(
    Schema.withConstructorDefault(Effect.succeed(AnySystemPartTypeId)),
    Schema.withDecodingDefaultKey(Effect.succeed(AnySystemPartTypeId), {
      encodingStrategy: "omit",
    }),
  ),
});

/** An {@link AnySystemPart} as it is encoded.
 *
 * @see {@link AnySystemPart} for the event it encodes.
 * @category models
 */
export type AnySystemPartEncoded = SystemPartEncoded<Record<string, Extension.Any>> & {
  [AnySystemPartTypeId]: typeof AnySystemPartTypeId;
};

/** Whether a value is a system event of an extension the kit does not hold.
 *
 * @see {@link AnySystemPart} for the event it recognises.
 * @category guards
 */
export const isAnySystemPart = (u: unknown): u is AnySystemPart =>
  Predicate.hasProperty(u, AnySystemPartTypeId);

/**
 * Creates the codec the system events a kit's extensions record are read with.
 *
 * The codec holds an entry for each extension of the kit, so an event recorded
 * as a {@link Trajectory.SystemPart} is read as the data of the extension it
 * belongs to. The entry of an extension that declares no system event is a part
 * nothing decodes as, since its schema is `Schema.Never` — see
 * {@link Extension.Extension}.
 *
 * @see {@link SystemPartView} for the codec a trajectory part carries.
 * @category schemas
 */
export const SystemPart = <Kit extends Any>(
  kit: Kit,
): Schema.Codec<SystemPart<Extensions<Kit>>, SystemPartEncoded<Extensions<Kit>>, never, never> =>
  // SAFETY: each entry's struct is the `SystemPart<Extensions<Kit>>` member for
  // that key, so the union of them is the codec the return type names.
  Schema.Union(
    Object.entries(kit.extensions).map(([id, extension]) => systemPart(id, extension.systemSchema)),
  ) as any;

/**
 * Creates the codec a system event is read with, whatever the kit that recorded
 * it.
 *
 * **When to use**
 *
 * Use as the payload of {@link Trajectory.SystemPart}, so that a recording read
 * with a kit it was not written with still reads.
 *
 * **Details**
 *
 * The kit's own events are read as the data of the extension that declared them,
 * and the events of an extension the kit does not hold as the JSON they were
 * recorded as — see {@link AnySystemPart}.
 *
 * @see {@link SystemPart} for the events of a kit's own extensions.
 * @category schemas
 */
export const SystemPartView = <Kit extends Any>(
  kit: Kit,
): Schema.Codec<SystemPart<Extensions<Kit>> | AnySystemPart, AnySystemPartEncoded, never, never> =>
  // SAFETY: `SystemPartView` is the kit's parts together with the `AnySystemPart`
  // fallback, which is what the union encodes.
  Schema.Union([SystemPart(kit), AnySystemPart]) as any;

/**
 * A {@link SystemPartView} as a type.
 *
 * @see {@link SystemPartView} for the codec it names.
 * @category models
 */
export type SystemPartView<Exts extends Record<string, Extension.Any>> = Readonly<
  SystemPart<Exts> | AnySystemPart
>;

/**
 * The ids of a kit's extensions that attach metadata to a message part.
 *
 * An extension attaches metadata when it declares the schema — see
 * {@link Extension.PartSchema} — and only such an extension contributes an entry
 * to what a message part carries.
 */
type MessageIds<Exts extends Record<string, Extension.Any>> = {
  readonly [Id in keyof Exts]: Extension.PartSchema<Exts[Id]> extends never ? never : Id;
}[keyof Exts];

/**
 * What the extensions of a kit attached to a message part, keyed by the id of the
 * extension each entry belongs to.
 *
 * **When to use**
 *
 * Use to read what the extensions of a kit recorded of a message — which model it
 * was routed to, what it cost the run — rather than the JSON a recording holds.
 *
 * **Details**
 *
 * An entry of an extension the kit holds is the data of the schema that extension
 * attaches metadata with, read as the newest version of it, and every other entry
 * is the JSON it was recorded as: the field is open, so a kit reads the entries it
 * describes and leaves the rest as they are.
 *
 * @see {@link MessageMetadata} for the codec it is read with.
 * @category models
 */
export type MessageMetadata<Exts extends Record<string, Extension.Any>> = Readonly<
  {
    readonly [Id in MessageIds<Exts> & string]?: Extension.PartSchema<Exts[Id]>["Type"];
  } & Record<string, Schema.Json>
>;

/**
 * Creates the codec a message part's metadata is read and written with, as a kit
 * describes it.
 *
 * **When to use**
 *
 * Use to read what the extensions of a kit attached to a message part, or to write
 * what an extension attaches to one, rather than work with the JSON a recording
 * holds.
 *
 * **Details**
 *
 * The entry of each extension of the kit that declares the schema is read as the data
 * of that schema, at the newest version of it: a recording that holds an older one is
 * read as the newest, exactly as the data an extension derives is. An entry of an
 * extension the kit does not hold is read as the JSON it was recorded as, and an
 * id the kit holds that recorded nothing is left out. Writing what was read states
 * each entry at the newest version of the schema it was read at.
 *
 * @see {@link MessageMetadata} for what it reads.
 * @category schemas
 */
export const MessageMetadata = <Kit extends Any>(
  kit: Kit,
): Schema.Codec<
  MessageMetadata<Extensions<Kit>>,
  Readonly<Record<string, Schema.Json>>,
  never,
  never
> => {
  const schemas: Record<string, Schema.Top> = {};

  for (const [id, extension] of Object.entries(kit.extensions)) {
    if (extension.partSchema !== Schema.Never) {
      schemas[id] = Schema.optional(extension.partSchema);
    }
  }

  // SAFETY: each field is the metadata schema of the extension whose id it is keyed
  // by, and the record holds every other entry as the JSON it was recorded as, so
  // what is read is what `MessageMetadata` names.
  return Schema.StructWithRest(Schema.Struct(schemas), [
    Schema.Record(Schema.String, Schema.Json),
  ]) as any;
};

/**
 * What a message part's metadata is written with, as the extensions of a kit
 * require it: an entry of every extension that attaches one.
 *
 * **When to use**
 *
 * Use where what a message carries of a kit is written rather than read — the
 * metadata of a message a session records, or of one a run enqueues — since an
 * extension that attaches metadata to a message part is one a message is written
 * with an entry of.
 *
 * **Details**
 *
 * It is {@link MessageMetadata} with the entries of the extensions the kit holds
 * required rather than optional, because writing is where the kit asks for them:
 * a message written under a kit that attaches metadata carries it. A kit that
 * attaches none asks nothing of a message, and an extension whose own schema is
 * optional is how a run states that it does not know that one.
 *
 * @see {@link HasMessageMetadata} for whether a kit asks for it at all.
 * @see {@link MessageMetadata} for what a recording holds of it.
 * @category models
 */
export type MessageMetadataInput<Exts extends Record<string, Extension.Any>> = Readonly<{
  readonly [Id in MessageIds<Exts> & string]: Extension.PartSchema<Exts[Id]>["Type"];
}>;

/**
 * Whether the extensions of a kit attach metadata to a message part.
 *
 * **When to use**
 *
 * Use where what a message is written with is asked of the kit — the metadata a
 * message of a stream carries, or of one a run enqueues — so that a kit that
 * attaches none asks for nothing.
 *
 * @see {@link MessageMetadataInput} for what a kit that does asks for.
 * @category models
 */
export type HasMessageMetadata<Exts extends Record<string, Extension.Any>> = [
  MessageIds<Exts>,
] extends [never]
  ? false
  : true;

/**
 * The extensions of the kits given, as one record, later kits winning the ids
 * they share.
 *
 * **When to use**
 *
 * Use to read the extensions a recording refers to in the record they make up
 * together.
 *
 * **Details**
 *
 * A kit that is only known as {@link Any} names no extension of its own, so what
 * the record holds is the extensions of the kits that are known. The kit a
 * recording was written with is not one of those: its extensions are the ones
 * the recording's own parts are already described by.
 *
 * @see {@link Extensionkit} for why a kit holds its extensions.
 * @category models
 */
export type Merged<Kits extends ReadonlyArray<Any>> = {
  readonly [Id in MergedKeys<Extensions<Kits[number]>>]: MergedEntry<Extensions<Kits[number]>, Id>;
};

/**
 * The ids of the kits given, which are the ids of the record they merge into.
 *
 * A kit that is only known as {@link Any} holds every extension at all, so the
 * ids its record names are `string` and contribute none of their own: reading
 * them would widen the ids of the record the others merge into to `string`, and
 * with them the data of every part of one to `unknown`.
 */
type MergedKeys<Exts> = Exts extends unknown
  ? string extends keyof Exts
    ? never
    : keyof Exts & string
  : never;

/** The extension the kits given hold at `Id`, later kits winning it where they share one. */
type MergedEntry<Exts, Id extends string> =
  Exts extends Record<Id, infer Entry> ? Extract<Entry, Extension.Any> : never;

/**
 * Merges the kits given into one, later kits winning the ids they share.
 *
 * **When to use**
 *
 * Use to read a recording with the extensions of several kits together, such as
 * when the kit a recording carries is to be added to.
 *
 * **Details**
 *
 * Every kit holds its extensions at their own ids, so nothing a kit contributes
 * is lost where the kits do not overlap; where two kits hold the same id, the
 * later kit's extension is the one the merged kit holds, and it is that version
 * the data recorded under the id is read as.
 *
 * @see {@link Merged} for the extensions the merged kit holds.
 * @category constructors
 */
export const merge = <Kits extends ReadonlyArray<Any>>(
  ...kits: Kits
): Extensionkit<Merged<Kits>> => {
  const extensions: Record<string, Extension.Any> = {};

  for (const kit of kits) {
    for (const [id, extension] of Object.entries(kit.extensions)) {
      extensions[id] = extension;
    }
  }

  // SAFETY: The record holds the extension of every kit at its own id, later
  // kits having replaced the earlier ones where they share one, which is the
  // record `Merged` names.
  return { extensions } as Extensionkit<Merged<Kits>>;
};

/**
 * Decodes the derived parts of a trajectory with the extensions it refers to.
 *
 * **When to use**
 *
 * Use to bind a recording to the extensions it refers to, such as one recorded
 * with no extensions or with extensions that have moved on since.
 *
 * **Details**
 *
 * The derived parts and the system events a trajectory holds are each encoded
 * with its own kit and decoded again with the merged one, so the data of a part
 * whose extension the kit did not hold becomes the data of that extension, at the
 * newest version of it — the one recorded is upgraded where the extension has
 * moved on since. What a message part carries of a kit's extensions is read with
 * the merged kit and written back at the version that kit states, since it is
 * recorded as the JSON of each entry rather than as the data of a schema. A part
 * that no extension matches stays unrestricted, the parts of every other kind are
 * carried over unchanged, and a schema failure is reported as
 * {@link TrajectoryError}.
 *
 * **Example** (Binding a recording to the extension that describes it)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Schema, Stream } from "effect"
 * import { Toolkit } from "effect/ai"
 * import { Extension, Extensionkit, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const count = Extension.make(
 *   "org.js.tra.count",
 *   {
 *     metadata: Extension.Metadata.make({ name: "Part count" }),
 *     output: Schema.TaggedStruct(Extension.OutputTag, {
 *       version: Schema.Literal("0.1.0"),
 *       tokens: Schema.Number
 *     }).pipe(VersionedSchema.make),
 *     failure: Schema.TaggedStruct(Extension.FailureTag, {
 *       version: Schema.Literal("0.1.0"),
 *       reason: Schema.String
 *     }).pipe(VersionedSchema.make)
 *   }
 * )
 *
 * const kit = { tool: Toolkit.empty, ext: Extensionkit.make({}) }
 * const variant = { ext: true, stream: false } as const
 *
 * const recorded = Trajectory.make(
 *   Stream.make(Trajectory.DerivedPart(kit.ext).make({
 *     extension: {
 *       extension: "org.js.tra.count",
 *       data: { _tag: "Output", version: "0.1.0", tokens: 1 }
 *     },
 *     attach: Option.none()
 *   })),
 *   kit,
 *   variant
 * )
 *
 * const bound = Extensionkit.decodeExtensionkits(
 *   Extensionkit.make({ "org.js.tra.count": count })
 * )(recorded)
 * const parts = await Effect.runPromise(Stream.runCollect(bound))
 * parts.length // => 1
 * ```
 *
 * @see {@link Merged} for the kit the parts are decoded with.
 * @category combinators
 */
export const decodeExtensionkits =
  <Kits extends ReadonlyArray<Any>>(...kits: Kits) =>
  <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
    trajectory: Trajectory.Trajectory<K, V, E, R>,
  ) => {
    const merged = merge(trajectory.kit.ext, ...kits);

    const encodeDerived = Schema.encodeEffect(Trajectory.DerivedPart(trajectory.kit.ext));
    const decodeDerived = Schema.decodeEffect(Trajectory.DerivedPart(merged));

    const encodeSystem = Schema.encodeEffect(Trajectory.SystemPart(trajectory.kit.ext));
    const decodeSystem = Schema.decodeEffect(Trajectory.SystemPart(merged));

    // What a message part carries is recorded as the JSON of each entry, so it is
    // read with the merged kit alone: the schema of an extension reads its own
    // entries at every version of them, and writing what was read back states the
    // newest one.
    const readMetadata = Schema.decodeEffect(MessageMetadata(merged));
    const writeMetadata = Schema.encodeEffect(MessageMetadata(merged));

    return trajectory.pipe(
      Stream.mapEffect(
        Effect.fn(function* (part) {
          if (part._tag === "Derived") {
            const encoded = yield* encodeDerived(part).pipe(
              Effect.mapError(TrajectoryError.encodeExtension(trajectory.kit.ext)),
            );

            return yield* decodeDerived(encoded).pipe(
              Effect.mapError(TrajectoryError.decodeExtension(merged)),
            );
          }

          if (part._tag === "System") {
            const encoded = yield* encodeSystem(part).pipe(
              Effect.mapError(TrajectoryError.encodeExtension(trajectory.kit.ext)),
            );

            return yield* decodeSystem(encoded).pipe(
              Effect.mapError(TrajectoryError.decodeExtension(merged)),
            );
          }

          // SAFETY: the field is on a message part and absent from every other
          // kind of part, so reading it off the part is reading the field where
          // there is one and nothing where there is not.
          const metadata = (part as Readonly<{ metadata?: Readonly<Record<string, Schema.Json>> }>)
            .metadata;

          if (metadata === undefined) {
            return part;
          }

          const read = yield* readMetadata(metadata).pipe(
            Effect.mapError(TrajectoryError.decodeExtension(merged)),
          );

          const written = yield* writeMetadata(read).pipe(
            Effect.mapError(TrajectoryError.encodeExtension(merged)),
          );

          // A part is rebuilt rather than written to, since whoever else reads the
          // trajectory holds the part it was given as well.
          return Object.assign({}, part, { metadata: written });
        }),
      ),
    );
  };

/**
 * The ids of a kit's extensions that derive data of a recording.
 *
 * An extension derives data when it declares a derivation — see
 * {@link Extension.HasDerivation} — and only such an extension is run by a
 * producer. An extension that is not known by value is taken to derive data,
 * since nothing of its schemas is known: a kit built while it runs is runnable by
 * whatever producers it is given.
 */
type Deriving<Exts extends Record<string, Extension.Any>> = {
  readonly [Id in keyof Exts]: Extension.HasDerivation<Exts[Id]> extends true ? Id : never;
}[keyof Exts];

/**
 * The producer of each of a kit's extensions that derives data, keyed the way the
 * kit is.
 *
 * **When to use**
 *
 * Use to declare the producers a kit's extensions are run by, or to type the
 * producers a function takes.
 *
 * **Details**
 *
 * An entry is the {@link Extension.Producer} of the extension at the same key, so
 * a producer is checked against the extension it belongs to: the data it yields
 * must be the data of that extension's newest version. A kit holds what its
 * producers were built into rather than the effects that build them, so what one
 * is built with, and what building it fails with, are read where it is built: an
 * entry names no service and no failure of its own, only what its extension
 * declares.
 *
 * Only an extension that derives data is an entry: an extension that declares no
 * derivation is run by no producer, so a kit asks nothing of it and
 * {@link Extension.emptyProducer} is not what stands for it.
 *
 * @see {@link Extension.emptyProducer} for the producer of an extension that
 * derives nothing of a recording.
 * @see {@link toProducers} for providing a kit with them.
 * @category models
 */
export type Producers<Exts extends Record<string, Extension.Any>> = Readonly<{
  [Id in Deriving<Exts> & string]: Extension.Producer<Exts[Id]>;
}>;

/**
 * What running a kit's producers emits: one extension's data, named by the
 * extension it belongs to.
 *
 * **When to use**
 *
 * Use to type what {@link produce} emits, or to read what a producer yielded
 * for an extension.
 *
 * **Details**
 *
 * A producer yields an {@link Extension.ProducerOutput} or fails with a
 * {@link Extension.ProducerFailure} — its extension's data, an optional
 * timestamp and the parts it is attached to — and does not name its extension,
 * because it is the kit that keys it. An entry here is either of those with the
 * key of the extension it belongs to, which is the payload a derived part
 * carries apart from the metadata a trajectory records every part with.
 *
 * @see {@link produce} for the stream these are emitted on.
 * @category models
 */
export type ProducedPart<Exts extends Record<string, Extension.Any>> = {
  [Id in Deriving<Exts> & string]: Readonly<
    { extension: Id } & (Extension.ProducerOutput<Exts[Id]> | Extension.ProducerFailure<Exts[Id]>)
  >;
}[Deriving<Exts> & string];

/**
 * What running a kit's producers fails with: the failure of each of its
 * extensions, as the union of them.
 *
 * **When to use**
 *
 * Use to tell the failure a producer derived of a recording from the failure of
 * the run, as {@link produce} does when it records the one.
 *
 * **Details**
 *
 * A producer fails with a {@link Extension.ProducerFailure} — its extension's
 * failure, an optional timestamp and the parts it is attached to — and does not
 * name its extension, because it is the kit that keys it. It is told from the
 * failure of the run by the tag its extension's failure carries, so what
 * {@link produce} reads is the failure of one of the kit's extensions.
 *
 * @see {@link produce} for the stream that records it.
 * @category models
 */
export type ProducedFailure<Exts extends Record<string, Extension.Any>> = {
  [Id in Deriving<Exts> & string]: Extension.ProducerFailure<Exts[Id]>;
}[Deriving<Exts> & string];

/**
 * A kit of extensions together with the producer of each of them.
 *
 * **When to use**
 *
 * Use when a recording is to carry the data of a kit's extensions, since an
 * extension whose producer is known is one that can be run.
 *
 * **Details**
 *
 * It is the kit itself, carrying the producers of its extensions beside them:
 * the extensions it holds are the ones a recording is read with, and the
 * producers are keyed as those extensions are, so each extension is run by the
 * producer it names and none is left without one. The producers are held beside
 * the extensions rather than replacing them because a producer does not name its
 * own extension: the key it is recorded under does, and that key is a key of
 * this kit.
 *
 * A kit is built without building its producers: what it holds is what they were
 * built into, so each one is built where it is provided rather than where the kit
 * is run — see {@link toProducers}.
 *
 * @see {@link toProducers} for building one.
 * @see {@link produce} for running it.
 * @category models
 */
export type WithProducers<Kit extends Any> = Kit & {
  readonly producers: Producers<Extensions<Kit>>;
};

/**
 * Provides each extension of a kit with its producer.
 *
 * **When to use**
 *
 * Use to make a kit runnable once the producer of every extension of it that
 * derives data is built, which is what {@link produce} needs.
 *
 * **Details**
 *
 * Only an extension that derives data is asked for a producer: an extension that
 * declares no derivation is run by no producer, so a kit of such extensions alone
 * is runnable as it is.
 *
 * The producers are checked against the kit: an entry is the producer of the
 * extension at its key, so a producer that yields another extension's data
 * fails to compile rather than to run. What a producer is built with, and what
 * building it fails with, are read where it is built and nowhere else: neither is
 * a property of the kit, and a run of it asks nothing on their account.
 *
 * A producer is built before it is handed here — `Effect.provide` with the
 * services it reads, or `yield*` of it in a program — so a service one is built
 * with travels with it rather than with the kit that runs it.
 *
 * The kit is carried through as it was given, so what is returned holds the
 * extensions it holds.
 *
 * **Example** (Providing a kit with the producer of its extension)
 *
 * ```ts import.meta.vitest
 * import { Schema, Stream } from "effect"
 * import { Extension, Extensionkit, VersionedSchema } from "@trajs/core"
 *
 * const count = Extension.make(
 *   "org.js.tra.count",
 *   {
 *     metadata: Extension.Metadata.make({ name: "Part count" }),
 *     output: Schema.TaggedStruct(Extension.OutputTag, {
 *       version: Schema.Literal("0.1.0"),
 *       tokens: Schema.Number
 *     }).pipe(VersionedSchema.make),
 *     failure: Schema.TaggedStruct(Extension.FailureTag, {
 *       version: Schema.Literal("0.1.0"),
 *       reason: Schema.String
 *     }).pipe(VersionedSchema.make)
 *   }
 * )
 *
 * // What the extension yields: the count of each part, as `0.1.0` states it. A
 * // producer is typed where it is built, since what it yields is the data of the
 * // extension it is keyed by.
 * const counting: Extension.Producer<typeof count> = (messages) =>
 *   messages.pipe(Stream.map((): Extension.ProducerOutput<typeof count> => ({
 *     output: { _tag: "Output", version: "0.1.0", tokens: 1 }
 *   })))
 *
 * const kit = Extensionkit.make({ "org.js.tra.count": count })
 * const runnable = Extensionkit.toProducers(kit, { "org.js.tra.count": counting })
 * Object.keys(runnable.producers) // => ["org.js.tra.count"]
 * ```
 *
 * @see {@link Extension.emptyProducer} for the producer of an extension that
 * derives nothing of a recording.
 * @see {@link produce} for running the kit it returns.
 * @category constructors
 */
export const toProducers = <Kit extends Any>(
  extkit: Kit,
  producers: Producers<Extensions<Kit>>,
): WithProducers<Kit> => ({ ...extkit, producers });

/**
 * Whether a value is the failure a producer derived of a part, rather than the
 * failure of the run: only the former carries the tag its extension declares.
 */
const isProducerFailure = (value: unknown): value is Extension.ProducerFailure<Extension.Any> =>
  Predicate.hasProperty(value, "failure") &&
  Predicate.isTagged(Extension.FailureTag)(value.failure);

/**
 * Runs every producer of a kit over the messages of a recording.
 *
 * **When to use**
 *
 * Use to derive what a kit's extensions record of a recording's messages, such
 * as to write them as the derived parts of a trajectory.
 *
 * **Details**
 *
 * A producer reads the messages a model was given and returned rather than the
 * parts a recording arrived in, so the recording is downgraded before any
 * producer sees it: the increments a streamed response arrived in are folded
 * into the parts they complete, and the data a kit derived of the recording is
 * dropped. Whatever variant the recording was written with, every producer is
 * then run on those messages, so all of them read the same ones, and their
 * outputs are interleaved as they are produced. A producer is run by the
 * extension it is keyed under, so what is emitted is that extension's data with
 * the key that names it, which is what a derived part carries.
 *
 * Only the extensions of the kit that derive data are run: an extension that
 * declares no derivation is run by no producer, and a kit whose extensions derive
 * nothing of a recording reads nothing of one and emits nothing.
 *
 * The messages are shared between the producers rather than read by each of
 * them, so a recording is read once however many extensions the kit holds, and
 * every producer reads the same ones. A producer was built before it was handed
 * to the kit, so a run of it asks for nothing on that account: the services of
 * the recording are provided to the run, and what a producer is built with
 * travels with the producer itself.
 *
 * The stream fails with the recording's failure, or with the
 * {@link TrajectoryError} a producer fails with once one has run. The failure a
 * producer derived of its extension is not a failure of the run: it is recorded
 * as a part of that extension, alongside what the producers yield.
 *
 * @see {@link toProducers} for the kit this runs.
 * @see {@link ProducedPart} for what is emitted.
 * @category combinators
 */
export const produce =
  <Kit extends Any>({ producers }: WithProducers<Kit>) =>
  <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
    recorded: Trajectory.TrajectoryStream<K, V, E, R>,
  ): Stream.Stream<ProducedPart<Extensions<Kit>>, E | TrajectoryError, R> => {
    // The keys of the record are the ids of the extensions that derive data, since
    // only such an extension is one a producer is keyed by — see {@link Producers}.
    const deriving = Object.keys(producers);

    // An extension that derives nothing of a recording is run by no producer, so a
    // kit that holds none of them derives nothing of a recording and reads nothing
    // of one.
    if (deriving.length === 0) {
      return Stream.empty;
    }

    // A producer reads the messages a model was given and returned, so the
    // recording is downgraded to them before any producer sees it. The messages
    // are broadcast between the producers because a stream serves a single
    // reading, and a recording read for its parts and for what is derived of it
    // arrives in one that is the branch of a broadcast.
    const messages = recorded.pipe(Trajectory.fold, Trajectory.toMessages);

    return messages.pipe(
      Stream.broadcastN({ n: deriving.length, capacity: "unbounded" }),
      Effect.map((readings) =>
        Stream.mergeAll(
          deriving.map((extension, index) => {
            // SAFETY: the keys of `Producers` are the ids of the extensions that
            // derive data, so the key read from it is one of those ids.
            const id = extension as Deriving<Extensions<Kit>> & string;

            return producers[id](readings[index]).pipe(
              Stream.map((produced) => ({ extension, ...produced })),
              // The failure a producer derived is the data of its extension, so it
              // is recorded as one of its parts rather than failing the run.
              Stream.catchIf(
                (error): error is ProducedFailure<Extensions<Kit>> => isProducerFailure(error),
                (failure) => Stream.make({ extension, ...failure }),
              ),
              // SAFETY: `Producers` is keyed as the extensions that derive data
              // are, so what a producer yields or fails with is the data of the
              // extension at its own key, which is what `ProducedPart` pairs it
              // with.
              Stream.map((part) => part as ProducedPart<Extensions<Kit>>),
            );
          }),
          { concurrency: "unbounded" },
        ),
      ),
      Stream.unwrap,
    );
  };
