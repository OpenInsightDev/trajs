/**
 * Metrics a producer reports of a trajectory, and the parts a recording holds
 * them as.
 *
 * A {@link Metric} is one kind of measurement an extension names, with the
 * schemas of what a producer reports of it and of what producing it fails with.
 * {@link makeKit} collects metrics into a kit, and {@link toProducers} provides a
 * kit with the producer of each of them, which {@link produce} runs over a
 * recording. {@link MetricParts} reads the parts of the metrics a kit names, and
 * {@link MetricPartsView} reads those parts while tolerating metrics the kit does
 * not name, so a recording another kit wrote still reads.
 */

import { Data, DateTime, Effect, Predicate, Schema, Stream } from "effect";
import type { NonEmptyArray } from "effect/Array";

import { foldParts } from "#/internal/folding.ts";
import type * as Trajectory from "#/Trajectory.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

import type { IndexByKey } from "./internal/types.ts";
import type { TrajectoryError } from "./TrajectoryError.ts";

export class Metadata extends Schema.Class<Metadata>("Metadata")({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

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

export type Any = Metric<string, string, VersionedSchema.Any, VersionedSchema.Any>;

export type Output<Ext extends Any> = Ext["output"];

export type Failure<Ext extends Any> = Ext["failure"];

type MetricsByTag<Ms> = IndexByKey<Ms, "tag">;

export type Metrickit<Metrics extends Record<string, Any>> = Readonly<{
  metrics: Metrics;
}>;

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

export type AnyKit = Metrickit<Record<string, Any>>;

/** A kit that declares no metric. */
export const emptyKit = makeKit();

/** The type of {@link emptyKit}. */
export type EmptyKit = typeof emptyKit;

export type MetricPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

export const MetricPart = <Tag extends string, S extends Schema.Top>(
  tag: Tag,
  schema: S,
): Schema.TaggedStruct<Tag, { readonly data: S }> => Schema.TaggedStruct(tag, { data: schema });

export type MetricPartEncoded = Readonly<{ _tag: string; data: unknown }>;

const AnyMetricPartTypeId = "~trajs/Metric/AnyMetricPart" as const;

/**
 * A metric part whose tag and data are not restricted by a kit.
 *
 * **When to use**
 *
 * Use to type a metric part of a metric the reading kit does not name, as
 * {@link MetricPartsView} reads one.
 *
 * **Details**
 *
 * A part read as this carries the `~trajs/Metric/AnyMetricPart` marker, so
 * {@link isAnyMetricPart} tells it from a part the kit read by the schema of the
 * metric it names.
 *
 * @see {@link MetricPart} for a part of a metric a kit names.
 * @category models
 */
export type AnyMetricPart = MetricPart<string, unknown>;

type RuntimeAnyMetricPart = AnyMetricPart & {
  readonly [AnyMetricPartTypeId]: typeof AnyMetricPartTypeId;
};

/**
 * Type guard to check whether a metric part is one a metric's own schema did not
 * read.
 *
 * **When to use**
 *
 * Use to tell a part {@link MetricPartsView} fell back to {@link AnyMetricPart}
 * for from a part it read as the metric of the kit that names it.
 *
 * @see {@link AnyMetricPart} for the part it checks for.
 * @category guards
 */
export const isAnyMetricPart = (u: unknown): u is RuntimeAnyMetricPart =>
  Predicate.hasProperty(u, AnyMetricPartTypeId);

/**
 * Schema for a metric part whose tag and data are not restricted by a kit.
 *
 * **When to use**
 *
 * Use to decode or encode a metric part of a metric the reading kit does not
 * name.
 *
 * **Details**
 *
 * - The marker is stated on a part when it is read and omitted when it is
 *   written, so a recording written again holds what it did.
 * - The tag must be a string and the data must be present: nothing else of a
 *   part of a metric a kit does not name is known.
 *
 * @see {@link MetricPart} for the schema of a part of a metric a kit names.
 * @category schemas
 */
export const AnyMetricPart: Schema.Codec<AnyMetricPart, MetricPartEncoded> = Schema.Struct({
  [AnyMetricPartTypeId]: Schema.Literal(AnyMetricPartTypeId).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(AnyMetricPartTypeId), {
      encodingStrategy: "omit",
    }),
  ),
  _tag: Schema.String,
  data: Schema.Unknown,
}).annotate({ identifier: "AnyMetricPart" });

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
 * Use where the producer of a metric reports a measurement it derived, which is
 * every measurement a producer reports: what is returned is what the kit records
 * as a metric part of the trajectory, about the parts the measurement was taken
 * for.
 *
 * **Details**
 *
 * The metric is what the output is read as and what tells a report of one from a
 * report of another: a producer names no metric of its own, since the key it is
 * held at in a kit is what names it. `output` is the metric's own output, at the
 * newest version of it, and `attach` names the parts the measurement is about —
 * see {@link ProducerOutput} for what a report holds.
 *
 * The metric is given as a type argument rather than taken as an argument of its
 * own — `makeOutput<typeof metric>(…)` — since nothing a report holds is a
 * property of the metric: what it holds of a run is the output it was handed and
 * the parts it is about, and one report of a metric is built the same way as
 * another.
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
 * kit records as a metric part of the trajectory rather than failing the run.
 *
 * **Details**
 *
 * It is {@link makeOutput} for the other direction: the metric is given as a type
 * argument for the same reason, `failure` is the metric's own failure at the newest
 * version of it, and `attach` names the parts the failure is about. What a
 * producer reports on its error channel is told from the failure of the run by
 * this shape's tag, so a failure a producer derived is recorded rather than
 * thrown.
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
 * Use to type the producer of a metric — what {@link Producers} keys by the
 * metric it belongs to — or to write one.
 *
 * **Details**
 *
 * A producer reads a trajectory and reports one {@link ProducerOutput} for each
 * measurement it derived of it, or fails with a {@link ProducerFailure} for one
 * it could not derive. The metric it belongs to is not named by the producer:
 * the key it is held at in a kit does, and that key is the tag of a metric of
 * that kit.
 *
 * The trajectory it reads is one whose response parts are whole —
 * {@link Trajectory.NonStreamConfig} — since what a producer measures is the parts
 * a model was given and returned rather than the increments an answer arrived in:
 * the parts of a streamed answer are folded into the whole parts they complete
 * before a producer reads them, which {@link produce} does for the kit it runs. The
 * kits a recording was read with are the reading's rather than the producer's, so a
 * producer measures a recording without knowing the toolkit, the kits or the
 * variant it was recorded with.
 *
 * What a run of a producer requires is what the trajectory it reads requires, so
 * a producer asks for no service of its own: a service it is built with is
 * provided where it is built and travels with the producer rather than with the
 * kit that runs it.
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
 * An entry is the {@link Producer} of the metric at the same key, which is the
 * tag the metric names. A producer is therefore checked against the metric it
 * belongs to: the data it reports must be the data of that metric's own schemas.
 * Every metric of a kit is an entry, since a metric states what it reports and
 * what reporting it fails with, so there is nothing for a kit to leave out.
 *
 * @see {@link toProducers} for providing a kit with them.
 * @category models
 */
export type Producers<Metrics extends Record<string, Any>> = Readonly<{
  [Tag in keyof Metrics & string]: Producer<Metrics[Tag]>;
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
 * It is the kit itself, carrying the producers of its metrics beside them: the
 * metrics it holds are the ones a recording is read with, and the producers are
 * keyed as those metrics are, so each metric is reported by the producer it
 * names and none is left without one. The producers are held beside the metrics
 * rather than standing for them because a producer does not name its own metric:
 * the key it is held at does, and that key is a key of this kit.
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
 * The producers are checked against the kit: an entry is the producer of the
 * metric at its key, so a producer that reports another metric's data fails to
 * compile rather than to run. What a producer is built with, and what building it
 * fails with, are read where it is built and nowhere else: neither is a property
 * of the kit.
 *
 * The kit is carried through as it was given, so what is returned holds the
 * metrics it holds.
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

/** The part schema each metric of a kit states, read as one. */
type MetricPartSchemas<Metrics extends Record<string, Any>> = {
  readonly [Tag in keyof Metrics]: Schema.TaggedStruct<
    Tag & string,
    { readonly data: ProducedSchema<Metrics[Tag]> }
  >;
}[keyof Metrics];

export type MetricParts<Metrics extends Record<string, Any>> = {
  readonly [Tag in keyof Metrics]: MetricPart<
    Tag & string,
    ProducerOutput<Metrics[Tag]> | ProducerFailure<Metrics[Tag]>
  >;
}[keyof Metrics];

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
 * Union type for metric parts that also accepts metrics the kit does not name.
 *
 * **When to use**
 *
 * Use to type a metric part read from a recording that may mention metrics the
 * reading kit does not name.
 *
 * **Details**
 *
 * Every metric part is one {@link AnyMetricPart} also carries, so a value of
 * this says only that a metric was reported, not which metric of the kit it was:
 * {@link MetricParts} is what types the parts of the metrics a kit names.
 *
 * @see {@link MetricParts} for parts restricted to the metrics of the kit.
 * @category models
 */
export type MetricPartsView<Metrics extends Record<string, Any>> =
  | MetricParts<Metrics>
  | AnyMetricPart;

/**
 * The codec {@link MetricPartsView} builds, named so that the codec states
 * {@link MetricPartsView} as the type it reads: the union it is built from names the
 * kit of every member, so its own type reads as that kit's schema rather than as the
 * parts of a metric, and the parts of one kit would not then read as another's.
 */
type MetricPartsViewSchema<Metrics extends Record<string, Any>> = Schema.Union<
  ReadonlyArray<MetricPartSchemas<Metrics> | typeof AnyMetricPart>
>;

/**
 * Creates a Schema for the parts of the metrics a kit names, including metrics
 * the kit does not name.
 *
 * **When to use**
 *
 * Use when decoding or encoding recorded metric parts that may mention metrics
 * the reading kit does not name.
 *
 * **Details**
 *
 * - Every metric of the kit is read by its own schema, as {@link MetricParts}
 *   reads it, in the order the kit holds the metrics.
 * - A part naming a metric of the kit whose data no longer matches a version of
 *   the schema that metric states falls back to {@link AnyMetricPart}, because
 *   reading a recording does not depend on the schemas it is read with.
 * - A part read as {@link AnyMetricPart} is written back as it was read, so
 *   re-writing a recording a kit wrote does not change it.
 *
 * **Example** (Reading metrics the kit named and one it did not)
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
 * const parts = Metric.MetricPartsView(Metric.makeKit(count))
 *
 * const named = Schema.decodeUnknownSync(parts)({
 *   _tag: "tokenize/count",
 *   data: {
 *     _tag: "ProducerFailure",
 *     failure: { version: "0.1.0", reason: "no tokenizer" },
 *     attach: ["session"]
 *   }
 * })
 *
 * Metric.isAnyMetricPart(named) // => false
 *
 * const unnamed = Schema.decodeUnknownSync(parts)({
 *   _tag: "atif/step",
 *   data: {
 *     _tag: "ProducerOutput",
 *     output: { version: "0.1.0", tokens: 3 },
 *     attach: ["session"]
 *   }
 * })
 *
 * Metric.isAnyMetricPart(unnamed) // => true
 * ```
 *
 * @see {@link MetricParts} for a Schema restricted to the metrics of the kit.
 * @see {@link AnyMetricPart} for the part an unnamed metric is read as.
 * @category schemas
 */
export const MetricPartsView = <K extends AnyKit>(
  kit: K,
): Schema.Codec<
  MetricPartsView<K["metrics"]>,
  MetricPartsViewSchema<K["metrics"]>["Encoded"],
  MetricPartsViewSchema<K["metrics"]>["DecodingServices"],
  MetricPartsViewSchema<K["metrics"]>["EncodingServices"]
> => {
  const parts: Array<Schema.Top> = [];

  for (const metric of Object.values(kit.metrics)) {
    parts.push(MetricPart(metric.tag, produced(metric)));
  }

  parts.push(AnyMetricPart);

  // SAFETY: every member is the part of one metric of the kit or the part of a
  // metric the kit does not name, which is what the return type reads it as.
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
 * Runs every producer of a kit over a recording, reporting what each of them
 * derived of it.
 *
 * **When to use**
 *
 * Use to derive the metrics a kit names from a trajectory, such as to record what
 * was derived as the metric parts of the trajectory, so that what a recording is
 * worth reads back without the producers that derived it.
 *
 * **Details**
 *
 * A recording is read once however many metrics the kit names: the parts are
 * shared between the producers rather than read by each of them, so the recording
 * is broadcast and every one of them reads the same parts.
 *
 * The parts a producer reads are the recording's own, with the increments a
 * streamed response arrived in folded into the whole parts they complete: a
 * producer measures what a model was given and returned, so it reads a part as it
 * was said rather than as it was recorded — see {@link Producer}. The folding is
 * the one `View` reads a streamed answer with, and a folded part carries the `uuid`
 * of the increment that completed it, so what a report attaches to is a part the
 * recording holds.
 *
 * What is emitted is one report of a metric with the tag of the metric it
 * belongs to, which is the part a recording holds a report as, as
 * {@link MetricParts} reads one: the data of the metric it was derived of, about
 * the parts it is attached to, apart from the metadata a trajectory records
 * every part with. A report of one metric is told from a report of another by
 * that tag alone, since a producer names no metric of its own.
 *
 * The failure a producer reports of a part is not a failure of the run: it is
 * emitted beside what the producers yield, as the metric's own failure, so a
 * part that could not be measured is recorded rather than throwing. The stream
 * fails with the recording's failure, or with the {@link TrajectoryError} a
 * producer fails with once one has read.
 *
 * What a producer is built with travels with the producer rather than with the
 * kit: a run of it asks for nothing on that account, and the services the
 * recording asks for are provided to the run.
 *
 * **Example** (Running a kit's producers over a recording)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Metric, Trajectory, VersionedSchema } from "@trajs/core"
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
 * // What the metric is reported by: a count for each part the recording holds. A
 * // producer is typed where it is written, since what it reports is the data of
 * // the metric it is keyed by.
 * const counting: Metric.Producer<typeof count> = (recording) =>
 *   recording.pipe(
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
 * // A recording another kit wrote: the parts are read as they are, whichever
 * // metrics they name, so a producer of the kit still reads every one of them.
 * const recorded = Stream.make(
 *   Schema.decodeSync(Trajectory.MetricPart(Metric.makeKit()))({
 *     _tag: "Metric",
 *     metric: { _tag: "atif/step", data: { version: "0.1.0", index: 1 } }
 *   })
 * )
 *
 * const parts = await Effect.runPromise(Stream.runCollect(Metric.produce(runnable)(recorded)))
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
    recorded: Trajectory.TrajectoryStream<Config, E, R>,
  ): Stream.Stream<MetricParts<Kit["metrics"]>, E | TrajectoryError, R> => {
    const tags = Object.keys(producers);

    // A kit that names no metric derives nothing of a recording, so it reads none
    // of one.
    if (tags.length === 0) {
      return Stream.empty;
    }

    return foldParts(recorded).pipe(
      // A producer reads the recording for the parts it measures, so the parts are
      // served to the producers rather than read by each of them: a stream serves
      // a single reading, and a recording read for what a kit derives of it
      // arrives in one that is the branch of a broadcast.
      Stream.broadcastN({ n: tags.length, capacity: "unbounded" }),
      Effect.map((readings) =>
        Stream.mergeAll(
          tags.map((tag, index) => {
            // SAFETY: `Producers` is keyed as the metrics of a kit are, so the
            // producer read from it is the one that reports the data of the metric
            // at its own tag.
            const report = producers[tag] as Producer<Any>;

            return report(readings[index]).pipe(
              Stream.map((reported) => ({ _tag: tag, data: reported })),
              // The failure a producer derived is the data of its metric, so it is
              // recorded as a metric part rather than failing the run.
              Stream.catchIf(isProducerFailure, (failure) =>
                Stream.make({ _tag: tag, data: failure }),
              ),
            );
          }),
          { concurrency: "unbounded" },
        ),
      ),
      Stream.unwrap,
    );
  };
