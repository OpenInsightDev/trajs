/**
 * Metrics a producer reports of a trajectory, and the parts a trajectory holds them
 * as.
 *
 * A {@link Metric} names one kind of measurement, with the schemas of what a
 * producer reports of it and of what producing it fails with. {@link makeKit} and
 * {@link mergeKit} collect metrics into kits, {@link toProducers} provides a kit
 * with a producer per metric, {@link produce} runs them over a trajectory, and
 * {@link MetricParts} reads a trajectory's metric parts under a kit.
 */

import { Data, DateTime, Effect, Predicate, Schema, Stream } from "effect";
import type { NonEmptyArray } from "effect/Array";

import { foldParts } from "#/internal/folding.ts";
import type * as Trajectory from "#/Trajectory.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

import type { IndexByKey } from "./internal/types.ts";
import type { TrajectoryError } from "./TrajectoryError.ts";

/**
 * Describes a metric: an optional name and description.
 *
 * @see {@link Metric} for the metric it describes.
 * @category models
 */
export class Metadata extends Schema.Class<Metadata>("Metadata")({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

/**
 * One kind of measurement an extension names.
 *
 * **When to use**
 *
 * Use to declare a metric an extension reports, or to type one.
 *
 * **Details**
 *
 * `package` and `id` name it — `tag` is `"pkg/id"` — and `metadata` describes it.
 * `output` is the schema of what a producer reports of it and `failure` the schema of
 * what producing it fails with, each at every version it was written at
 * ({@link VersionedSchema.VersionedSchema}). Collect metrics into a kit with
 * {@link makeKit}.
 *
 * @see {@link makeKit} for collecting metrics into a kit.
 * @see {@link toProducers} for providing a kit with the producer of each metric.
 * @category models
 */
export class Metric<
  Pkg extends string,
  Id extends string,
  Output extends VersionedSchema.Any,
  Failure extends VersionedSchema.Any,
> extends Data.Class<{
  package: Pkg;
  id: Id;
  metadata: Metadata;
  output: Output;
  failure: Failure;
}> {
  get tag(): `${Pkg}/${Id}` {
    return `${this.package}/${this.id}`;
  }
}

/** A metric whose package, id and schemas are not known. */
export type Any = Metric<string, string, VersionedSchema.Any, VersionedSchema.Any>;

/** The schema of what a producer reports of a metric, at every version. */
export type Output<Ext extends Any> = Ext["output"];

/** The schema of what producing a metric fails with, at every version. */
export type Failure<Ext extends Any> = Ext["failure"];

type MetricsByTag<Ms> = IndexByKey<Ms, "tag">;

/**
 * A kit of metrics, keyed by the tag each names.
 *
 * @see {@link makeKit} for building one, {@link toProducers} for providing it.
 * @category models
 */
export type Metrickit<Metrics extends Record<string, Any>> = Readonly<{
  metrics: Metrics;
}>;

/**
 * Collects metrics into a kit, keyed by the tag each names.
 *
 * **When to use**
 *
 * Use to gather the metrics an extension reports into the kit a trajectory is read
 * with.
 *
 * **Details**
 *
 * Each metric is keyed by its own `tag`, so a kit names one metric per tag. A kit
 * names the metrics it was given and no others; {@link emptyKit} names none.
 *
 * @see {@link mergeKit} for adding the metrics of one kit to another's.
 * @see {@link toProducers} for providing a kit with a producer per metric.
 * @category constructors
 */
export const makeKit = <Ms extends ReadonlyArray<Any>>(...metrics: Ms) => {
  // SAFETY: every metric given is inserted under its own tag below, so what the record
  // holds is one metric per tag the kit names.
  const output = {} as Record<string, Any>;

  for (const metric of metrics) {
    output[metric.tag] = metric;
  }

  // SAFETY: `output` holds the metric of every tag in `Ms`, which is what `MetricsByTag`
  // reads the metrics given as.
  return { metrics: output } as Metrickit<MetricsByTag<Ms>>;
};

/** A kit whose metrics are not known. */
export type AnyKit = Metrickit<Record<string, Any>>;

/** A kit that declares no metric. */
export const emptyKit = makeKit();

/** The type of {@link emptyKit}. */
export type EmptyKit = typeof emptyKit;

/** The metrics of the kits given as one, a tag they share holding the metric of the kit latest among them. */
type MetricsMerged<Ks extends ReadonlyArray<AnyKit>> = Ks extends readonly [
  infer Head extends AnyKit,
  ...infer Tail extends ReadonlyArray<AnyKit>,
]
  ? Omit<Head["metrics"], keyof MetricsMerged<Tail>> & MetricsMerged<Tail>
  : {};

/**
 * The producers of the kits given as one, where every kit given states them: a kit
 * provided with producers states one for each of the metrics it names.
 *
 * A producer is held at the tag of the metric it reports, so the producers of
 * several kits merge by the same rule as their metrics do.
 */
type ProducersMerged<Ks extends ReadonlyArray<WithProducers<AnyKit>>> = Ks extends readonly [
  infer Head extends WithProducers<AnyKit>,
  ...infer Tail extends ReadonlyArray<WithProducers<AnyKit>>,
]
  ? Omit<Head["producers"], keyof ProducersMerged<Tail>> & ProducersMerged<Tail>
  : {};

/**
 * The kit the metrics of the kits given make, with the producers of its metrics
 * where every kit given states them.
 *
 * **When to use**
 *
 * Use to type the kit {@link mergeKit} returns.
 *
 * **Details**
 *
 * Every kit's metrics are named; where two kits name the same tag, the metric of
 * the later kit wins.
 *
 * A merged kit states the producers of the kits given only where every one of them
 * states all of its own, and states none otherwise: a kit whose producers cover
 * some of its metrics alone is not one {@link produce} can run. See
 * {@link WithProducers}.
 *
 * @see {@link mergeKit} for the kit it types.
 * @see {@link WithProducers} for the kit a metric is reported by a producer of.
 * @category models
 */
export type MetrickitMerged<Ks extends ReadonlyArray<AnyKit>> =
  Ks extends ReadonlyArray<WithProducers<AnyKit>>
    ? Metrickit<MetricsMerged<Ks>> & { readonly producers: ProducersMerged<Ks> }
    : Metrickit<MetricsMerged<Ks>>;

/**
 * Adds the metrics of each kit given to the ones of the kits before it.
 *
 * **When to use**
 *
 * Use when the metrics of several extensions are read together, or when a reader
 * that knows some of a trajectory's metrics reads it under the ones it knows without
 * forgetting the rest.
 *
 * **Details**
 *
 * A shared tag holds the metric of the latest kit that names it, so a kit of a
 * version an extension states now states over the one a trajectory was read with.
 *
 * The producers the kits were provided with are added the same way, but a merged
 * kit states producers only where every kit given states all of its own, as
 * {@link MetrickitMerged} says.
 *
 * **Example** (Adding the metrics of one kit to another's)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Metric, VersionedSchema } from "@trajs/core"
 *
 * const count = new Metric.Metric({
 *   package: "tokenize",
 *   id: "count",
 *   metadata: new Metric.Metadata({ name: "Count" }),
 *   output: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make),
 *   failure: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     reason: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const cost = new Metric.Metric({
 *   package: "pricing",
 *   id: "cost",
 *   metadata: new Metric.Metadata({ name: "Cost" }),
 *   output: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     dollars: Schema.Number
 *   }).pipe(VersionedSchema.make),
 *   failure: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     reason: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const merged = Metric.mergeKit(Metric.makeKit(count), Metric.makeKit(cost))
 * Object.keys(merged.metrics) // => ["tokenize/count", "pricing/cost"]
 * ```
 *
 * @see {@link makeKit} for a kit of the metrics given alone.
 * @see {@link MetrickitMerged} for the kit it returns.
 * @category constructors
 */
export const mergeKit = <Ks extends ReadonlyArray<AnyKit>>(...kits: Ks): MetrickitMerged<Ks> => {
  // SAFETY: every metric of every kit is inserted under its own tag below, so what
  // the record holds is one metric per tag the kits name.
  const metrics = {} as Record<string, Any>;

  // SAFETY: every producer of every kit that states one is inserted under the tag
  // of the metric it reports below, so what the record holds is one producer per
  // tag those kits name.
  const producers = {} as Record<string, Producer<Any>>;

  let reported = true;

  for (const kit of kits) {
    Object.assign(metrics, kit.metrics);

    if (!Predicate.hasProperty(kit, "producers")) {
      reported = false;
      continue;
    }

    // SAFETY: a kit that states producers states them keyed as its metrics are —
    // what `WithProducers` is — so what is read off it is a record of producers.
    Object.assign(producers, kit.producers as Record<string, Producer<Any>>);
  }

  // SAFETY: a kit that was provided with producers states all of them, which is
  // what `MetrickitMerged` reads the kits given as where every one of them states
  // them, and a kit merged from one that states none is read as stating none.
  return (reported ? { metrics, producers } : { metrics }) as MetrickitMerged<Ks>;
};

/** A metric part: its report under the tag it was reported with. */
export type MetricPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

/**
 * Builds the part schema of one metric: its report, under `tag`.
 *
 * **When to use**
 *
 * Use to build a part schema for a single tag; {@link MetricParts} builds the union
 * over every metric of a kit.
 *
 * **Details**
 *
 * The part read is a tagged struct whose `data` is the schema given.
 *
 * @see {@link MetricParts} for the parts of a whole kit.
 * @category schemas
 */
export const MetricPart = <Tag extends string, S extends Schema.Top>(
  tag: Tag,
  schema: S,
): Schema.TaggedStruct<Tag, { readonly data: S }> => Schema.TaggedStruct(tag, { data: schema });

/**
 * What a producer reports of one part: the metric's output, the timestamp it was
 * derived at, and the parts it is about.
 *
 * @see {@link makeOutput} for the constructor, and for what a report holds.
 * @see {@link ProducerFailure} for what a producer reports instead.
 * @category models
 */
export class ProducerOutput<Ext extends Any> extends Data.TaggedClass("ProducerOutput")<{
  readonly output: Output<Ext>["Type"];
  readonly timestamp?: DateTime.Utc;
  readonly attach: NonEmptyArray<string>;
}> {}

/** What a producer reports of a metric beside what it produced, as {@link ProducerOutput} and {@link ProducerFailure} shape it. */
const reported = {
  timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  attach: Schema.NonEmptyArray(Schema.String),
};

/**
 * The schema of what a producer reports of one metric, as {@link ProducerOutput}
 * shapes it.
 */
const outputSchemaOf = <Ext extends Any>(metric: Ext): OutputSchema<Ext> =>
  Schema.TaggedStruct("ProducerOutput", { output: metric.output, ...reported });

/**
 * The schema of the failure a producer reports of one metric, as
 * {@link ProducerFailure} shapes it.
 */
const failureSchemaOf = <Ext extends Any>(metric: Ext): FailureSchema<Ext> =>
  Schema.TaggedStruct("ProducerFailure", { failure: metric.failure, ...reported });

/**
 * Reports what a producer derived of a part, as the metric's output states it.
 *
 * **When to use**
 *
 * Use where the producer of a metric reports a measurement it derived.
 *
 * **Details**
 *
 * `output` is the metric's own output at its newest version, and `attach` names the
 * parts the measurement is about. The metric is given as a type argument —
 * `makeOutput<typeof metric>(…)` — because nothing a report holds is a property of
 * the metric; a producer names no metric of its own, since the key it is held at in
 * a kit does.
 *
 * @see {@link makeFailure} for what a producer reports instead.
 * @category constructors
 */
export const makeOutput = <Ext extends Any>(
  output: Output<Ext>["Type"],
  { timestamp, attach }: { timestamp?: DateTime.Utc; attach: NonEmptyArray<string> },
): ProducerOutput<Ext> => new ProducerOutput<Ext>({ output, timestamp, attach });

/**
 * What a producer reports of a part it derived nothing of: the metric's failure,
 * the timestamp it was derived at, and the parts it is about.
 *
 * @see {@link makeFailure} for the constructor, and for what a report holds.
 * @see {@link ProducerOutput} for what a producer reports instead.
 * @category models
 */
export class ProducerFailure<Ext extends Any> extends Data.TaggedClass("ProducerFailure")<{
  readonly failure: Failure<Ext>["Type"];
  readonly timestamp?: DateTime.Utc;
  readonly attach: NonEmptyArray<string>;
}> {}

/**
 * Reports a part a producer derived no measurement of, as the metric's failure
 * states it.
 *
 * **When to use**
 *
 * Use where the producer of a metric reports a part it could not measure, which a
 * kit produces as a metric part rather than failing the run.
 *
 * **Details**
 *
 * It is {@link makeOutput} for the other direction: the metric is a type argument
 * for the same reason, `failure` is the metric's own failure at its newest version,
 * and `attach` names the parts the failure is about. This shape's tag tells a
 * failure a producer derived from the failure of the run, so the former is produced
 * rather than thrown.
 *
 * @see {@link ProducerFailure} for what a report holds.
 * @see {@link makeOutput} for what a producer reports instead.
 * @category constructors
 */
export const makeFailure = <Ext extends Any>(
  failure: Failure<Ext>["Type"],
  { timestamp, attach }: { timestamp?: DateTime.Utc; attach: NonEmptyArray<string> },
): ProducerFailure<Ext> => new ProducerFailure<Ext>({ failure, timestamp, attach });

/**
 * What a producer of a metric is: what reads a trajectory and reports the data
 * of the metric it belongs to.
 *
 * **When to use**
 *
 * Use to type the producer of a metric — what {@link Producers} keys by the metric
 * it belongs to — or to write one.
 *
 * **Details**
 *
 * A producer reads a trajectory and reports one {@link ProducerOutput} per
 * measurement it derived, or fails with a {@link ProducerFailure} for one it could
 * not derive. It does not name its own metric: the key it is held at in a kit does.
 *
 * It reads a trajectory whose response parts are whole
 * ({@link Trajectory.NonStreamConfig}), since what it measures is the parts a model
 * was given and returned rather than the increments an answer arrived in; {@link
 * produce} folds streamed parts before a producer reads them. The kits a trajectory
 * was read with belong to the reading, not the producer.
 *
 * A producer asks for no service of its own: what a run of it requires is what the
 * trajectory requires.
 *
 * @see {@link ProducerOutput} for what a producer reports.
 * @see {@link ProducerFailure} for what it fails with.
 * @category models
 */
export type Producer<Ext extends Any> = <E, R>(
  trajectory: Trajectory.TrajectoryStream<Trajectory.NonStreamConfig, E, R>,
) => Stream.Stream<ProducerOutput<Ext>, E | TrajectoryError | ProducerFailure<Ext>, R>;

/**
 * The producer of each metric of a kit, keyed the way the kit is.
 *
 * **When to use**
 *
 * Use to declare the producers a kit's metrics are reported by, or to type the
 * producers a function takes.
 *
 * **Details**
 *
 * An entry is the {@link Producer} of the metric at the same key (the metric's
 * tag), so a producer is checked against its metric: what it reports must match that
 * metric's schemas. Every metric is an entry, so there is nothing to leave out.
 *
 * @see {@link toProducers} for providing a kit with them.
 * @category models
 */
export type Producers<Metrics extends Record<string, Any>> = Readonly<{
  [Ext in Metrics[keyof Metrics] as Ext["tag"]]: Producer<Ext>;
}>;

/**
 * A kit of metrics together with the producer of each of them.
 *
 * **When to use**
 *
 * Use when a trajectory is to be read for the data of a kit's metrics, since a
 * metric whose producer is known is one that can be reported.
 *
 * **Details**
 *
 * It is the kit itself with the producers of its metrics beside them, keyed as those
 * metrics are, so each metric is reported by the producer at its tag and none is
 * left without one. The producers are held beside the metrics rather than standing
 * for them because a producer does not name its own metric: its key does.
 *
 * @see {@link toProducers} for building one.
 * @see {@link produce} for running it.
 * @category models
 */
export type WithProducers<Kit extends AnyKit> = Kit & {
  readonly producers: Producers<Kit["metrics"]>;
};

/**
 * Provides each metric of a kit with its producer.
 *
 * **When to use**
 *
 * Use to make a kit reportable once the producer of every metric of it is built.
 *
 * **Details**
 *
 * The producers are checked against the kit — an entry is the producer of the metric
 * at its key — so a producer that reports another metric's data fails to compile
 * rather than to run. What a producer is built with, and what building it fails
 * with, are read where it is built and are not properties of the kit. The kit is
 * carried through as it was given.
 *
 * **Example** (Providing a kit with the producer of its metric)
 *
 * ```ts import.meta.vitest
 * import { Schema, Stream } from "effect"
 * import { Metric, VersionedSchema } from "@trajs/core"
 *
 * const count = new Metric.Metric({
 *   package: "tokenize",
 *   id: "count",
 *   metadata: new Metric.Metadata({ name: "Count" }),
 *   output: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make),
 *   failure: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     reason: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * // What the metric is reported by: the count of each part it was derived for. A
 * // producer is typed where it is written, since what it reports is the data of
 * // the metric it is keyed by.
 * const counting: Metric.Producer<typeof count> = () => Stream.empty
 *
 * const runnable = Metric.toProducers(Metric.makeKit(count), {
 *   "tokenize/count": counting
 * })
 * Object.keys(runnable.producers) // => ["tokenize/count"]
 * ```
 *
 * @see {@link Producers} for the producers it takes.
 * @see {@link WithProducers} for the kit it returns.
 * @see {@link produce} for running the kit it returns.
 * @category constructors
 */
export const toProducers = <Kit extends AnyKit>(
  kit: Kit,
  producers: Producers<Kit["metrics"]>,
): WithProducers<Kit> => ({ ...kit, producers });

/** The schema of a value a producer reports of a metric, as {@link ProducerOutput} shapes it. */
type OutputSchema<Ext extends Any> = Schema.TaggedStruct<
  "ProducerOutput",
  { readonly output: Output<Ext> } & typeof reported
>;

/** The schema of a failure a producer reports of a metric, as {@link ProducerFailure} shapes it. */
type FailureSchema<Ext extends Any> = Schema.TaggedStruct<
  "ProducerFailure",
  { readonly failure: Failure<Ext> } & typeof reported
>;

/** The data a metric is produced with, read as the tag a producer reports it under. */
type ProducedSchema<Ext extends Any> = Schema.Union<
  readonly [OutputSchema<Ext>, FailureSchema<Ext>]
>;

const produced = <Ext extends Any>(metric: Ext): ProducedSchema<Ext> =>
  Schema.Union([outputSchemaOf(metric), failureSchemaOf(metric)]);

/** The part schema of one metric: its report, under the tag that metric names. */
type MetricPartSchema<Ext> = Ext extends Any
  ? Schema.TaggedStruct<Ext["tag"], { readonly data: ProducedSchema<Ext> }>
  : never;

/** The part schemas the metrics of the metrics given state, as one. */
type MetricPartSchemas<Metrics extends Record<string, Any>> = MetricPartSchema<
  Metrics[keyof Metrics]
>;

/** The part one metric is held as: its report, under the tag that metric names. */
type MetricPartOf<Ext> = Ext extends Any
  ? MetricPart<Ext["tag"], ProducerOutput<Ext> | ProducerFailure<Ext>>
  : never;

/**
 * What a trajectory holds of the metrics of a kit.
 *
 * **When to use**
 *
 * Use to type a metric part, such as one {@link produce} emits or one a
 * trajectory holds.
 *
 * **Details**
 *
 * A part is the tag it was reported under and the report itself: the output a
 * producer yielded, or the failure it reported. Since a report does not say which
 * metric it is of, a part reads as the metric of the reading kit that names its tag
 * and no other: a metric the kit does not name is one the reading holds no schema
 * of.
 *
 * @see {@link MetricParts} for the schema that reads one.
 * @category models
 */
export type MetricParts<Metrics extends Record<string, Any>> = MetricPartOf<Metrics[keyof Metrics]>;

/**
 * The parts a trajectory holds of the metrics of a kit, as one schema.
 *
 * **When to use**
 *
 * Use to read or write the metric parts of a trajectory under the kit that says
 * what they are — the kit that produced them, or one that states the same metrics.
 *
 * **Details**
 *
 * - Every metric of the kit is a member of the union, read under its own tag by the
 *   report that metric states.
 * - A part of any other metric reads as no member: a tag means the schema of the
 *   metric that names it, so a reading covers only the metrics of the kit in hand.
 * - A kit that names no metric reads no part.
 *
 * **Example** (Reading the metric parts a kit produced)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Metric, VersionedSchema } from "@trajs/core"
 *
 * const count = new Metric.Metric({
 *   package: "tokenize",
 *   id: "count",
 *   metadata: new Metric.Metadata({ name: "Count" }),
 *   output: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make),
 *   failure: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     reason: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const parts = Metric.MetricParts(Metric.makeKit(count))
 *
 * const read = Schema.decodeUnknownSync(parts)({
 *   _tag: "tokenize/count",
 *   data: {
 *     _tag: "ProducerOutput",
 *     output: { version: "0.1.0", tokens: 3 },
 *     attach: ["session"]
 *   }
 * })
 *
 * read.data._tag // => "ProducerOutput"
 *
 * // A metric the kit does not name is not a part it reads.
 * Schema.is(parts)({
 *   _tag: "atif/step",
 *   data: { _tag: "ProducerOutput", output: { version: "0.1.0", tokens: 3 }, attach: ["session"] }
 * }) // => false
 * ```
 *
 * @see {@link MetricParts} for what a part is.
 * @category schemas
 */
export const MetricParts = <K extends AnyKit>(
  kit: K,
): Schema.Union<ReadonlyArray<MetricPartSchemas<K["metrics"]>>> => {
  const parts: Array<Schema.Top> = [];

  for (const metric of Object.values(kit.metrics)) {
    parts.push(MetricPart(metric.tag, produced(metric)));
  }

  // SAFETY: every member is the part of one metric of the kit, which is what
  // `MetricPartSchemas` reads the metrics of a kit as.
  return Schema.Union(parts) as any;
};

/**
 * Whether a value is the failure a producer derived of a part, rather than the
 * failure of the run: only the former is a {@link ProducerFailure}, which is
 * tagged as one and carries the metric's own failure.
 */
const isProducerFailure = (value: unknown): value is ProducerFailure<Any> =>
  Predicate.isTagged("ProducerFailure")(value) && Predicate.hasProperty(value, "failure");

/**
 * Runs every producer of a kit over a trajectory, reporting what each of them
 * derived of it.
 *
 * **When to use**
 *
 * Use to derive the metrics a kit names from a trajectory, such as to produce what
 * was derived as the metric parts of the trajectory, so that what a trajectory is
 * worth reads back without the producers that derived it.
 *
 * **Details**
 *
 * The parts a producer reads are the trajectory's own, with the increments a
 * streamed response arrived in folded into the whole parts they complete, so a
 * producer reads what a model was given and returned as it was said — see
 * {@link Producer}. A folded part carries the `uuid` of the increment that completed
 * it, so what a report attaches to is a part the trajectory holds.
 *
 * What is emitted is one report of a metric per part, tagged with that metric's tag
 * — the data of the metric about the parts it is attached to — as {@link MetricParts}
 * reads one. The tag alone tells one report from another, since a producer names no
 * metric of its own.
 *
 * A failure a producer reports is not a failure of the run: it is emitted beside
 * what the producers yield, as the metric's own failure, so a part that could not be
 * measured is produced rather than throwing. The stream fails with the trajectory's
 * failure, or with the {@link TrajectoryError} a producer fails with.
 *
 * What a producer is built with travels with the producer, not the kit, so a run of
 * it asks for nothing on that account.
 *
 * **Example** (Running a kit's producers over a trajectory)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Extra, Metric, Trajectory, VersionedSchema } from "@trajs/core"
 *
 * const count = new Metric.Metric({
 *   package: "tokenize",
 *   id: "count",
 *   metadata: new Metric.Metadata({ name: "Count" }),
 *   output: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make),
 *   failure: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     reason: Schema.String
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * // What the metric is reported by: a count for each part the trajectory holds. A
 * // producer is typed where it is written, since what it reports is the data of
 * // the metric it is keyed by.
 * const counting: Metric.Producer<typeof count> = (trajectory) =>
 *   trajectory.pipe(
 *     Stream.map((): Metric.ProducerOutput<typeof count> =>
 *       Metric.makeOutput<typeof count>({ version: "0.1.0", tokens: 1 }, {
 *         attach: ["01890a5d-ac96-774b-bcce-b302099a8057"]
 *       })
 *     )
 *   )
 *
 * const runnable = Metric.toProducers(Metric.makeKit(count), {
 *   "tokenize/count": counting
 * })
 *
 * // What the producers are run over: a part of a trajectory, whichever kit wrote
 * // it. A producer reads what a model was given and returned rather than a report
 * // of its own metric, so every producer of the kit reads every part.
 * const produced = Stream.make(
 *   Trajectory.sessionPart(Extra.makeKit())({
 *     id: "01890a5d-ac96-774b-bcce-b302099a8057"
 *   })
 * )
 *
 * const parts = await Effect.runPromise(Stream.runCollect(Metric.produce(runnable)(produced)))
 *
 * Array.from(parts).map((part) => part._tag) // => ["tokenize/count"]
 * ```
 *
 * @see {@link toProducers} for the kit this runs.
 * @see {@link MetricParts} for what is emitted.
 * @category combinators
 */
export const produce =
  <Kit extends AnyKit>({ producers }: WithProducers<Kit>) =>
  <Config extends Trajectory.AnyConfig, E, R>(
    produced: Trajectory.TrajectoryStream<Config, E, R>,
  ): Stream.Stream<MetricParts<Kit["metrics"]>, E | TrajectoryError, R> => {
    const tags = Object.keys(producers);

    // A kit that names no metric derives nothing of a trajectory, so it reads none
    // of one.
    if (tags.length === 0) {
      return Stream.empty;
    }

    // SAFETY: every report is emitted under the tag of the metric it is reported by,
    // which is the part the kit holds of that metric — one part per metric it names.
    return foldParts(produced).pipe(
      // A producer reads the trajectory for the parts it measures, so the parts are
      // served to the producers rather than read by each of them: a stream serves
      // a single reading, and a trajectory read for what a kit derives of it
      // arrives in one that is the branch of a broadcast.
      Stream.broadcastN({ n: tags.length, capacity: "unbounded" }),
      Effect.map((readings) =>
        Stream.mergeAll(
          tags.map((tag, index) => {
            // SAFETY: a kit states its producers keyed as its metrics are, so the
            // producer at a tag reports the data of the metric at its own tag.
            const report = (producers as Record<string, Producer<Any>>)[tag]!;

            return report(readings[index]).pipe(
              Stream.map((reported) => ({ _tag: tag, data: reported })),
              // The failure a producer derived is the data of its metric, so it is
              // produced as a metric part rather than failing the run.
              Stream.catchIf(isProducerFailure, (failure) =>
                Stream.make({ _tag: tag, data: failure }),
              ),
            );
          }),
          { concurrency: "unbounded" },
        ),
      ),
      Stream.unwrap,
    ) as Stream.Stream<MetricParts<Kit["metrics"]>, E | TrajectoryError, R>;
  };
