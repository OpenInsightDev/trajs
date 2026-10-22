/**
 * Metrics a producer reports of a trajectory, and the parts a trajectory holds them
 * as.
 *
 * A {@link Metric} names one kind of measurement, with the schemas of what a
 * producer reports of it and of what producing it fails with. {@link MetricKit.make}
 * and {@link MetricKit.merge} collect metrics into kits, {@link MetricKit.toProducers}
 * provides a kit with a producer per metric, {@link produce} runs them over a
 * trajectory, and {@link MetricParts} reads a trajectory's metric parts under a kit.
 */

import { Data, DateTime, Schema, Stream } from "effect";
import type { NonEmptyArray } from "effect/Array";

import { runProducers } from "#/internal/metric.ts";
import type * as MetricKit from "#/MetricKit.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

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
 * {@link MetricKit.make}.
 *
 * @see {@link MetricKit.make} for collecting metrics into a kit.
 * @see {@link MetricKit.toProducers} for providing a kit with the producer of each metric.
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
 * Use to type the producer of a metric — what {@link MetricKit.Producers} keys by
 * the metric it belongs to — or to write one.
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
 * import { Metric, MetricKit, VersionedSchema } from "@trajs/core"
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
 * const parts = Metric.MetricParts(MetricKit.make(count))
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
export const MetricParts = <K extends MetricKit.Any>(
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
 * import { Extra, ExtraKit, Metric, MetricKit, Trajectory, VersionedSchema } from "@trajs/core"
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
 * const runnable = MetricKit.toProducers(MetricKit.make(count), {
 *   "tokenize/count": counting
 * })
 *
 * // What the producers are run over: a part of a trajectory, whichever kit wrote
 * // it. A producer reads what a model was given and returned rather than a report
 * // of its own metric, so every producer of the kit reads every part.
 * const produced = Stream.make(Trajectory.parts(Trajectory.anyConfig).mainSession())
 *
 * const parts = await Effect.runPromise(Stream.runCollect(Metric.produce(runnable)(produced)))
 *
 * Array.from(parts).map((part) => part._tag) // => ["tokenize/count"]
 * ```
 *
 * @see {@link MetricKit.toProducers} for the kit this runs.
 * @see {@link MetricParts} for what is emitted.
 * @category combinators
 */
export const produce =
  <K extends MetricKit.Any>({ producers }: MetricKit.WithProducers<K>) =>
  <Config extends Trajectory.AnyConfig, E, R>(
    produced: Trajectory.TrajectoryStream<Config, E, R>,
  ): Stream.Stream<MetricParts<K["metrics"]>, E | TrajectoryError, R> =>
    runProducers(producers, produced);
