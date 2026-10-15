import { Data, type DateTime, Schema, Stream } from "effect";

import { type GivenSteps, type Moved, type Step, moveSchema } from "#/internal/extension.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

export class Metadata extends Schema.Class<Metadata>("Metadata")({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

/**
 * The tag an extension's output data carries, which tells what a producer
 * yielded of a part from the failure it derived of the same one.
 *
 * @category type IDs
 */
export const OutputTag = "Output";

/** {@link OutputTag} as a type.
 *
 * @see {@link OutputTag} for the value it names.
 * @category type IDs
 */
export type OutputTag = "Output";

/**
 * The tag an extension's failure data carries, which tells the failure a
 * producer derived of a recording apart from the failure of the run that
 * recorded it.
 *
 * @category type IDs
 */
export const FailureTag = "Failure";

/** {@link FailureTag} as a type.
 *
 * @see {@link FailureTag} for the value it names.
 * @category type IDs
 */
export type FailureTag = "Failure";

/**
 * The output an extension declares: a versioned schema whose data carries
 * {@link OutputTag}.
 *
 * **When to use**
 *
 * Use where an extension declares what its producers yield, or where a function
 * takes one whose data it does not know.
 *
 * **Details**
 *
 * The tag is what tells what a producer yielded of a part from the failure it
 * derived of that part: both are the data of the extension the part carries, and
 * the tag says which of the two it is. The constraint is stated on the schema's
 * decoded type, since a schema is covariant in it.
 *
 * @see {@link Extension} for the two versioned schemas an extension's data is
 * described by.
 * @category models
 */
export type ProducerOutputSchema = VersionedSchema.Any &
  Schema.Schema<{ readonly _tag: OutputTag }>;

/**
 * The failure an extension declares: a versioned schema whose data carries
 * {@link FailureTag}.
 *
 * **When to use**
 *
 * Use where an extension declares the failure of deriving its data, or where a
 * function takes one whose data it does not know.
 *
 * **Details**
 *
 * The tag is what tells the failure a producer derived of a part from the
 * failure of the run that recorded it: a producer reports both on its error
 * channel, and a kit records the one while it reports the other. The constraint
 * is stated on the schema's decoded type, since a schema is covariant in it.
 *
 * @see {@link Extension} for the two versioned schemas an extension's data is
 * described by.
 * @category models
 */
export type ProducerFailureSchema = VersionedSchema.Any &
  Schema.Schema<{ readonly _tag: FailureTag }>;

/**
 * The two schemas an extension derives a recording with: what a producer yields of
 * a part, and the failure it derives of a part it yields no data for.
 *
 * **When to use**
 *
 * Use where an extension declares what it derives of a recording, or where a
 * function takes the pair.
 *
 * **Details**
 *
 * The two are declared together because a producer reports both, and because the
 * tag each schema's data carries is what tells a yielded datum from a derived
 * failure where both are recorded as one part of the extension.
 *
 * @see {@link Extension} for the schemas an extension carries.
 * @see {@link Producer} for what yields them.
 * @category models
 */
export interface Derivation {
  readonly output: ProducerOutputSchema;
  readonly failure: ProducerFailureSchema;
}

/**
 * The config of an {@link Extension}: the schema each kind of data the extension
 * contributes is written at, or the schema nothing is written at where it
 * contributes none of that kind.
 *
 * It is the constraint and the default of {@link Extension}'s config, and is not
 * named by a caller: an extension is declared with {@link make}, which reads the
 * config off what it was given.
 *
 * Where an extension declares none of one, it carries the schema nothing is written
 * at rather than a schema of its own: `Schema.Never` where it records data, so
 * what is read at it is `never` and a kit leaves it out rather than asking for it.
 * What a producer yields is the exception, and is `Schema.Void` where the extension
 * declares no derivation: a producer that derives nothing yields nothing rather
 * than being unable to yield, which is how `effect/ai`'s `Tool` splits its own two
 * schemas — `Void` where it yields and `Never` where it fails.
 */
interface Schemas {
  readonly part: VersionedSchema.Any | Schema.Never;
  readonly system: VersionedSchema.Any | Schema.Never;
  readonly output: ProducerOutputSchema | Schema.Void;
  readonly failure: ProducerFailureSchema | Schema.Never;
}

/**
 * An extension of the trajectory format: the data one id names, and the schemas
 * that say how that data reaches a recording.
 *
 * **When to use**
 *
 * Use as an entry of an {@link Extensionkit.Extensionkit}, or to read what an
 * extension contributes to a recording.
 *
 * **Details**
 *
 * The id is what the data of the extension is recorded under, and is the key the
 * extension is held at in a kit. `metadata` describes the extension itself, and
 * the schemas the extension carries are what its data is written at. An
 * extension may declare any of them, and one it declares none of carries the
 * schema nothing is written at rather than a schema of its own — `Schema.Never`
 * where it records data, and `Schema.Void` where it is what a producer yields,
 * since a producer that derives nothing yields nothing rather than being unable to
 * yield. A kit is therefore read whole: the entry an extension contributes where it
 * declares nothing decodes nothing, so it is left out of what a part holds without
 * being tested for.
 *
 * The schemas are told apart by how their data reaches a recording, so none is
 * expressed in terms of another:
 *
 * - `partSchema` is the schema the metadata the extension attaches to a message
 *   part is written at. It is written into the part itself: the part's
 *   `metadata` holds the data of every extension that declares one, keyed by the
 *   id of the extension. {@link PartSchema} reads it without the schema nothing is
 *   written at.
 * - `systemSchema` is the schema a system event of the extension's is written at.
 *   It is a part of its own rather than data attached to one, recorded as a
 *   {@link Trajectory.SystemPart} at the point of the recording it happened at —
 *   see {@link SystemSchema}.
 * - `outputSchema` and `failureSchema` are the schemas the extension derives a
 *   recording at: what a producer yields, and the failure it derives instead —
 *   see {@link Derivation}. An extension declares both or neither, which is what
 *   {@link HasDerivation} reads.
 *
 * @see {@link make} for the constructor.
 * @category models
 */
export class Extension<
  out Id extends string = string,
  out Config extends Schemas = Schemas,
> extends Data.Class<{
  readonly id: Id;
  readonly metadata: Metadata;
  readonly partSchema: Config["part"];
  readonly systemSchema: Config["system"];
  readonly outputSchema: Config["output"];
  readonly failureSchema: Config["failure"];
}> {}

/**
 * An extension whose schemas are not known, each of them read as any of the schemas
 * it could be.
 *
 * @see {@link Extension} for an extension of known schemas.
 * @category models
 */
export type Any = Extension<string>;

/**
 * The schema an extension declares its derived data with, or `never` where it
 * derives none.
 *
 * **When to use**
 *
 * Use to read the shape an extension's derived data is written in, such as to
 * type a part whose extension is not known by value.
 *
 * **Details**
 *
 * It is the schema the extension carries: `self` is the newest version of it and
 * its `Type` is that version, which the data of every version before it reads as.
 * The failure of the extension is declared the same way — see
 * {@link FailureSchema}. Where an extension declares none, it carries
 * `Schema.Void`, which is left out rather than read as it, so `Type` is what a
 * version of the extension's data reads as and `never` where there is no such
 * version.
 *
 * @see {@link ProducerOutput} for what a producer yields at it.
 * @category models
 */
export type OutputSchema<Ext extends Any> = Exclude<Ext["outputSchema"], Schema.Void>;

/**
 * The schema an extension declares the failure of its derivation with.
 *
 * @see {@link OutputSchema} for the same of the extension's output.
 * @see {@link ProducerFailure} for what a producer derives at it.
 * @category models
 */
export type FailureSchema<Ext extends Any> = Exclude<Ext["failureSchema"], Schema.Never>;

/**
 * The schema an extension declares the metadata of a message part with, or
 * `never` where it declares none.
 *
 * @see {@link Extension} for the schemas an extension carries.
 * @category models
 */
export type PartSchema<Ext extends Any> = Exclude<Ext["partSchema"], Schema.Never>;

/**
 * The schema an extension declares a system event with, or `never` where it
 * declares none.
 *
 * @see {@link Extension} for the schemas an extension carries.
 * @category models
 */
export type SystemSchema<Ext extends Any> = Exclude<Ext["systemSchema"], Schema.Never>;

/**
 * Whether an extension derives data of a recording.
 *
 * **When to use**
 *
 * Use where the schemas an extension carries decide what a function asks of it or
 * records of it, such as to read which of a kit's extensions contributes a
 * {@link Trajectory.DerivedPart}.
 *
 * **Details**
 *
 * It reads the schema an extension declares a derivation at: the two schemas of a
 * derivation are declared as a pair, so an extension that declares none carries
 * `Schema.Never` at its failure, which is what tells it from an extension that
 * declares one. The
 * same test at runtime is `extension.failureSchema !== Schema.Never`, though a kit
 * leaves such an entry out of what it reads rather than asking — see
 * {@link Extension}.
 *
 * An extension that is not known by value is taken to derive data, since nothing
 * of its schemas is known: what one carries is read as the constraint of the
 * {@link Extension} type parameter rather than as the schemas it declared.
 *
 * @see {@link HasSystemSchema} for the same of the system schema it declares.
 * @category models
 */
export type HasDerivation<Ext extends Any> = [FailureSchema<Ext>] extends [never] ? false : true;

/**
 * Whether an extension declares a system schema, which is what makes it record
 * system events as parts of their own.
 *
 * @see {@link HasDerivation} for the same of the data an extension derives.
 * @see {@link SystemSchema} for the schema it reads.
 * @category models
 */
export type HasSystemSchema<Ext extends Any> = [SystemSchema<Ext>] extends [never] ? false : true;

/**
 * What a producer yields of one part: the data of its extension, the timestamp it
 * was derived at, and the parts it is about.
 *
 * **When to use**
 *
 * Use to read what a producer derived of a part, or to write what an extension
 * yields of one.
 *
 * **Details**
 *
 * A yielded datum names no extension: the key a producer is run under is the
 * extension it belongs to — see {@link Extensionkit.ProducedPart} for what a run
 * of a kit pairs the two as. The data of the extension is the whole of what is
 * required; `attach` holds the `uuid`s of the parts the datum is about and
 * `timestamp` when it was derived. Every datum is about at least one part, since
 * what is recorded of it is a part of the extension that names the parts it is
 * read with.
 *
 * @see {@link Producer} for the producers that yield them.
 * @category models
 */
export type ProducerOutput<Ext extends Any> = Readonly<{
  output: OutputSchema<Ext>["Type"];
  timestamp?: DateTime.Utc;
  attach: [string, ...string[]];
}>;

/**
 * What a producer derives of a part it yields no data for: the failure its
 * extension declares, the timestamp it was derived at, and the parts it is about.
 *
 * **When to use**
 *
 * Use to report a part an extension could not derive data of, which a kit records
 * as a part of that extension rather than failing the run.
 *
 * **Details**
 *
 * The failure the extension declares is the whole of what is required, and
 * `attach` and `timestamp` say which parts it is about and when it was derived,
 * as they do of a {@link ProducerOutput}, down to naming at least one part. What
 * a producer reports on its error channel is told from the failure of the run by
 * the tag the failure carries, so a failure a producer derived is recorded
 * rather than thrown.
 *
 * @see {@link FailureSchema} for the failure an extension declares.
 * @see {@link Extensionkit.ProducedFailure} for the failure of a kit's producers.
 * @category models
 */
export type ProducerFailure<Ext extends Any> = Readonly<{
  failure: FailureSchema<Ext>["Type"];
  timestamp?: DateTime.Utc;
  attach: [string, ...string[]];
}>;

/**
 * What a kit derives of a recording's messages, as one extension of it.
 *
 * **When to use**
 *
 * Use to type the producer of an extension — what {@link Extensionkit.Producers}
 * keys by the extension it belongs to — or to write one.
 *
 * **Details**
 *
 * A producer reads the messages a model was given and returned, folded into the
 * parts they complete, and yields a datum of its extension for each it derives
 * one from. The messages it is given fail with `E`, and what it yields fails
 * with the same `E`, on top of the {@link TrajectoryError} a recording fails
 * with and the failure its extension declares. It asks for no service of its own:
 * what it yields requires exactly what the messages it was given require, which is
 * what lets whatever a producer is built with be provided where it is built rather
 * than where a recording is run.
 *
 * An extension package offers one as the effect that builds it — an
 * `Effect.Effect<Producer<Ext>, E, R>` — so a service a producer is built with is
 * provided around that effect and travels with the producer rather than with the
 * kit that runs it; a kit holds what the effect was built into.
 *
 * A producer names no extension: what it yields is read as the data of the
 * extension it is keyed by — see {@link Extensionkit.ProducedPart} for what a run
 * of a kit pairs the two as.
 *
 * @see {@link Extensionkit.toProducers} for providing a kit with them.
 * @category models
 */
export type Producer<Ext extends Any> = <E, R>(
  messages: Trajectory.TrajectoryStream<
    Trajectory.AnyKit,
    Trajectory.NonStreamMessageVariant,
    E,
    R
  >,
) => Stream.Stream<ProducerOutput<Ext>, E | TrajectoryError | ProducerFailure<Ext>, R>;

/**
 * The producer of an extension that derives nothing of a recording.
 *
 * **When to use**
 *
 * Use where a kit holds an extension that declares a derivation but derives
 * nothing of the recording it is run over, so that every extension the kit holds
 * is run by the producer it names and none is left without one.
 *
 * **Details**
 *
 * A kit runs the producer of each extension it derives with at that extension's
 * own key, so what an extension that derives nothing is run by is a producer
 * that yields nothing: none of the extension's data is derived of the recording,
 * and nothing else about the run changes.
 *
 * It is typed at the data of no extension at all — `Producer<never>`, which is
 * all it yields — so one value is the producer of every such extension, whatever
 * data those extensions declare.
 *
 * What it is given, it drains: a kit hands each of its extensions its own reading
 * of the recording, so an extension that derives nothing of one still reads it —
 * see {@link Extensionkit.produce} for the readings a kit hands out.
 *
 * **Example** (A kit deriving the data of one extension but not another)
 *
 * ```ts import.meta.vitest
 * import { Schema, Stream } from "effect"
 * import { Extension, Extensionkit, VersionedSchema } from "@trajs/core"
 *
 * const count = Extension.make(
 *   "org.js.tra.count",
 *   {
 *     metadata: Extension.Metadata.make({ name: "Part count" }),
 *     derived: {
 *       output: Schema.TaggedStruct(Extension.OutputTag, {
 *         version: Schema.Literal("0.1.0"),
 *         tokens: Schema.Number
 *       }).pipe(VersionedSchema.make),
 *       failure: Schema.TaggedStruct(Extension.FailureTag, {
 *         version: Schema.Literal("0.1.0"),
 *         reason: Schema.String
 *       }).pipe(VersionedSchema.make)
 *     }
 *   }
 * )
 *
 * const other = Extension.make(
 *   "org.js.tra.other",
 *   {
 *     metadata: Extension.Metadata.make({ name: "Something else" }),
 *     derived: {
 *       output: Schema.TaggedStruct(Extension.OutputTag, {
 *         version: Schema.Literal("0.1.0"),
 *         note: Schema.String
 *       }).pipe(VersionedSchema.make),
 *       failure: Schema.TaggedStruct(Extension.FailureTag, {
 *         version: Schema.Literal("0.1.0"),
 *         reason: Schema.String
 *       }).pipe(VersionedSchema.make)
 *     }
 *   }
 * )
 *
 * const counting: Extension.Producer<typeof count> = (messages) =>
 *   messages.pipe(Stream.map((part): Extension.ProducerOutput<typeof count> => ({
 *     output: { _tag: "Output", version: "0.1.0", tokens: 1 },
 *     attach: [part.uuid]
 *   })))
 *
 * const kit = Extensionkit.make({
 *   "org.js.tra.count": count,
 *   "org.js.tra.other": other
 * })
 *
 * // The kit is run whole: the extension that is not derived of a recording is run
 * // by the producer that yields nothing of it.
 * const runnable = Extensionkit.toProducers(kit, {
 *   "org.js.tra.count": counting,
 *   "org.js.tra.other": Extension.emptyProducer
 * })
 * Object.keys(runnable.producers) // => ["org.js.tra.count", "org.js.tra.other"]
 * ```
 *
 * @see {@link Producer} for what a producer is.
 * @see {@link Extensionkit.toProducers} for the kit it is provided to.
 * @category constructors
 */
export const emptyProducer: Producer<never> = (messages) => messages.pipe(Stream.drain);

/**
 * The schemas an extension declares, read off what `make` was declared with.
 *
 * The derivation is declared as a pair, so the two schemas of it are read from the
 * pair together: an extension that declares no derivation declares neither of
 * them, and carries `Schema.Void` at what a producer yields and `Schema.Never` at
 * what it fails with — see {@link Extension}.
 */
type SchemasOf<Part, System, Derived> = {
  readonly part: Part extends VersionedSchema.Any ? Part : Schema.Never;
  readonly system: System extends VersionedSchema.Any ? System : Schema.Never;
  readonly output: Derived extends Derivation ? Derived["output"] : Schema.Void;
  readonly failure: Derived extends Derivation ? Derived["failure"] : Schema.Never;
};

/**
 * Declares an extension: the id its data is recorded under, and the schemas it
 * contributes to a recording.
 *
 * **When to use**
 *
 * Use to declare what an extension contributes, such as to hold it in a kit a
 * recording is read with or derived with.
 *
 * **Details**
 *
 * The id is the key the extension is held at in a kit and what its data is
 * recorded under. A schema the caller declares none of is left as the schema nothing
 * is written at rather than given one of its own — `Schema.Never`, or
 * `Schema.Void` for what a producer yields — so an extension that only records
 * system events declares no derivation, and one that only attaches metadata to a
 * message part declares neither — see {@link Extension} for the schemas.
 *
 * An extension is declared without what derives its data: a kit holds the
 * extension itself, and the producer of the data it derives is provided to the
 * kit — see {@link Extensionkit.toProducers}. What a derivation is declared with
 * is a pair: a producer yields one of the two schemas and fails with the other, so
 * the two are declared together or not at all.
 *
 * **Example** (Declaring an extension that attaches metadata to a message part)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension, VersionedSchema } from "@trajs/core"
 *
 * const routing = Extension.make("org.js.tra.route", {
 *   metadata: Extension.Metadata.make({ name: "Routing" }),
 *   part: Schema.TaggedStruct("Route", {
 *     version: Schema.Literal("0.1.0"),
 *     model: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * // The extension derives nothing of a recording, so it declares no derivation.
 * routing.outputSchema // => Schema.Void
 * ```
 *
 * @see {@link Extension} for the schemas an extension carries.
 * @see {@link upgrade} for moving its schemas to their next versions.
 * @category constructors
 */
export const make = <
  const Id extends string,
  const Part extends VersionedSchema.Any | undefined = undefined,
  const System extends VersionedSchema.Any | undefined = undefined,
  const Derived extends Derivation | undefined = undefined,
>(
  id: Id,
  {
    metadata,
    part,
    system,
    derived,
  }: {
    readonly metadata: Metadata;
    readonly part?: Part;
    readonly system?: System;
    readonly derived?: Derived;
  },
): Extension<Id, SchemasOf<Part, System, Derived>> =>
  // SAFETY: each schema is the schema the caller declared or the schema nothing is
  // written at where it declared none — `Schema.Void` for what a producer yields
  // and `Schema.Never` for the rest — which is the schemas the return type names.
  new Extension<Id>({
    id,
    metadata,
    partSchema: part ?? Schema.Never,
    systemSchema: system ?? Schema.Never,
    outputSchema: derived?.output ?? Schema.Void,
    failureSchema: derived?.failure ?? Schema.Never,
  }) as Extension<Id, SchemasOf<Part, System, Derived>>;

/**
 * Whether a schema an extension carries is one it declared, rather than the schema
 * nothing is written at: `Schema.Never` for the schemas that record data, and
 * `Schema.Void` for what a producer yields, which a producer that derives nothing
 * yields as.
 */
const declaresSchema = (
  schema: VersionedSchema.Any | Schema.Never | Schema.Void,
): schema is VersionedSchema.Any => schema !== Schema.Never && schema !== Schema.Void;

/**
 * Moves the schemas of an extension's data to their next versions.
 *
 * **When to use**
 *
 * Use when a new version of an extension's data is derived from the one before
 * it, so a recording written at the older version still reads as the newer one.
 *
 * **Details**
 *
 * Every schema an extension carries is moved by the step given for it: the fields
 * of the version next, and how a datum of the version before reads into them. The
 * schemas an extension carries beside its derivation are stepped under the name each
 * is declared with: the metadata it attaches to a message part with `part`, and
 * the events it records as parts of their own with `system`.
 *
 * The two schemas of a derivation — what a producer yields and what it fails with —
 * are declared as a pair, so they are stepped as a pair, by a call of their own:
 * one call moves either of them alone, and moves neither of an extension that
 * declares no derivation, and an extension whose derivation and whose other schemas
 * both move takes one call for each.
 *
 * A schema no step is given for is carried over unchanged, so a version may move one
 * schema alone. Where the extension declares none, the schema nothing is recorded at
 * is carried over: nothing is moved at it whatever step it was given, and
 * the extension is returned with that schema as it was. The schemas a step is given
 * for are the ones the returned extension's data is read at, and a datum recorded
 * at any version of a schema is read as the newest one.
 *
 * **Example** (Moving the schema a message part's metadata is written at)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension, VersionedSchema } from "@trajs/core"
 *
 * const routing = Extension.make("org.js.tra.route", {
 *   metadata: Extension.Metadata.make({ name: "Routing" }),
 *   part: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     model: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const routed = routing.pipe(
 *   Extension.upgrade({
 *     part: {
 *       fields: (fields) => ({
 *         ...fields,
 *         version: Schema.Literal("0.1.1"),
 *         effort: Schema.optional(Schema.String)
 *       }),
 *       change: { decode: (from) => ({ ...from, version: "0.1.1" }) }
 *     }
 *   })
 * )
 *
 * // The schema reads a datum of either version, and writes the newest one.
 * routed.partSchema.self.fields.version.literal // => "0.1.1"
 * ```
 *
 * @see {@link make} for declaring the schemas it moves.
 * @category combinators
 */
export function upgrade<
  OutputPrev extends ProducerOutputSchema,
  OutputMore extends Schema.Struct.Fields & { readonly version: VersionedSchema.AnyVersion },
  FailurePrev extends ProducerFailureSchema,
  FailureMore extends Schema.Struct.Fields & { readonly version: VersionedSchema.AnyVersion },
>(steps: {
  readonly derived: {
    readonly output: Step<OutputMore, OutputPrev>;
    readonly failure: Step<FailureMore, FailurePrev>;
  };
  readonly metadata?: (previous: Metadata) => Metadata;
}): <
  Id extends string,
  Part extends VersionedSchema.Any | Schema.Never,
  System extends VersionedSchema.Any | Schema.Never,
>(
  extension: Extension<
    Id,
    {
      readonly part: Part;
      readonly system: System;
      readonly output: OutputPrev;
      readonly failure: FailurePrev;
    }
  >,
) => Extension<
  Id,
  {
    readonly part: Part;
    readonly system: System;
    // The fields of a schema are spread, so the tag it was declared with is the
    // one the moved schema carries.
    readonly output: Moved<OutputPrev, OutputMore> & ProducerOutputSchema;
    readonly failure: Moved<FailurePrev, FailureMore> & ProducerFailureSchema;
  }
>;
export function upgrade<
  OutputPrev extends ProducerOutputSchema,
  OutputMore extends Schema.Struct.Fields & { readonly version: VersionedSchema.AnyVersion },
>(steps: {
  readonly derived: {
    readonly output: Step<OutputMore, OutputPrev>;
    readonly failure?: undefined;
  };
  readonly metadata?: (previous: Metadata) => Metadata;
}): <
  Id extends string,
  Part extends VersionedSchema.Any | Schema.Never,
  System extends VersionedSchema.Any | Schema.Never,
  Failure extends ProducerFailureSchema,
>(
  extension: Extension<
    Id,
    {
      readonly part: Part;
      readonly system: System;
      readonly output: OutputPrev;
      readonly failure: Failure;
    }
  >,
) => Extension<
  Id,
  {
    readonly part: Part;
    readonly system: System;
    // The fields of a schema are spread, so the tag it was declared with is the
    // one the moved schema carries.
    readonly output: Moved<OutputPrev, OutputMore> & ProducerOutputSchema;
    readonly failure: Failure;
  }
>;
export function upgrade<
  FailurePrev extends ProducerFailureSchema,
  FailureMore extends Schema.Struct.Fields & { readonly version: VersionedSchema.AnyVersion },
>(steps: {
  readonly derived: {
    readonly output?: undefined;
    readonly failure: Step<FailureMore, FailurePrev>;
  };
  readonly metadata?: (previous: Metadata) => Metadata;
}): <
  Id extends string,
  Part extends VersionedSchema.Any | Schema.Never,
  System extends VersionedSchema.Any | Schema.Never,
  Output extends ProducerOutputSchema,
>(
  extension: Extension<
    Id,
    {
      readonly part: Part;
      readonly system: System;
      readonly output: Output;
      readonly failure: FailurePrev;
    }
  >,
) => Extension<
  Id,
  {
    readonly part: Part;
    readonly system: System;
    readonly output: Output;
    // The fields of a schema are spread, so the tag it was declared with is the
    // one the moved schema carries.
    readonly failure: Moved<FailurePrev, FailureMore> & ProducerFailureSchema;
  }
>;
export function upgrade<
  Part extends Schema.Struct.Fields & { readonly version: VersionedSchema.AnyVersion } = never,
  System extends Schema.Struct.Fields & { readonly version: VersionedSchema.AnyVersion } = never,
>(steps: {
  readonly part?: Step<Part>;
  readonly system?: Step<System>;
  readonly metadata?: (previous: Metadata) => Metadata;
}): <Id extends string, Config extends Schemas>(
  extension: Extension<Id, Config>,
) => Extension<
  Id,
  {
    readonly part: Config["part"] extends Schema.Never
      ? Config["part"]
      : Moved<VersionedSchema.Any, Part, Config["part"]>;
    readonly system: Config["system"] extends Schema.Never
      ? Config["system"]
      : Moved<VersionedSchema.Any, System, Config["system"]>;
    readonly output: Config["output"];
    readonly failure: Config["failure"];
  }
>;
export function upgrade(steps: GivenSteps): (extension: any) => any {
  const { part, system, derived, metadata } = steps;

  // Where the extension declares none, there is nothing to move: the schema nothing
  // is written at is carried over as it was, whatever step it was given.
  const moved = <Prev extends VersionedSchema.Any | Schema.Never | Schema.Void>(
    schema: Prev,
    step: Step<any, any> | undefined,
  ): Prev => {
    if (step === undefined || !declaresSchema(schema)) {
      return schema;
    }

    // SAFETY: the schema is not the schema nothing is written at, so it is a
    // versioned schema, which is what the step moves and what this returns it as.
    return moveSchema(schema, step) as Prev;
  };

  return (extension) => {
    // SAFETY: each schema is either the extension's own schema or the step the
    // caller wrote for it, so what is built is the extension it was given with
    // those schemas moved on.
    return new Extension({
      id: extension.id,
      metadata: metadata?.(extension.metadata) ?? extension.metadata,
      partSchema: moved(extension.partSchema, part),
      systemSchema: moved(extension.systemSchema, system),
      outputSchema: moved(extension.outputSchema, derived?.output),
      failureSchema: moved(extension.failureSchema, derived?.failure),
    }) as Any;
  };
}
