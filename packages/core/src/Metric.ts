/**
 * Versioned metric declarations, reports, and stream producers.
 *
 * {@link Metric} declares output and failure schemas.
 * {@link produce} runs kit producers and emits tagged reports.
 *
 * @stability stable
 */

import { Data, DateTime, Schema, Stream } from "effect";
import type { NonEmptyArray } from "effect/Array";

import * as Config from "#/Config.ts";
import { runProducers } from "#/internal/metric.ts";
import type * as MetricKit from "#/MetricKit.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/**
 * Optional display information for a {@link Metric}.
 *
 * @stability stable
 * @category schemas
 */
export class Metadata extends Schema.Class<Metadata>("Metadata")({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}

/**
 * A metric declaration with versioned output and failure schemas.
 *
 * **Details**
 *
 * `tag` joins `package` and `id` with `/`.
 * Kits and metric parts use this tag as the metric's identity.
 * The declaration does not contain a producer.
 *
 * @see {@link MetricKit.toProducers} for associating producers with declarations.
 * @see {@link Output} for successful reports.
 * @see {@link Failure} for failed reports.
 * @stability stable
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

/**
 * A {@link Metric} without specific identity or report types.
 *
 * @stability stable
 * @category utility types
 */
export type Any = Metric<string, string, VersionedSchema.Any, VersionedSchema.Any>;

/**
 * A metric report identified by its declaration's tag.
 *
 * @see {@link MetricPart} for the schema.
 * @stability stable
 * @category models
 */
export type MetricPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

/**
 * Creates a schema for a tagged metric report.
 *
 * @see {@link MetricParts} for all declarations of a kit.
 * @stability stable
 * @category schemas
 */
export const MetricPart = <Tag extends string, S extends Schema.Top>(
  tag: Tag,
  schema: S,
): Schema.TaggedStruct<Tag, { readonly data: S }> => Schema.TaggedStruct(tag, { data: schema });

/**
 * A successful metric report with optional timing and attachments.
 *
 * **Details**
 *
 * `attach` names part uuids or session ids.
 * Omitting `attach` leaves the report trajectory-wide.
 * Omitting `timestamp` leaves the report untimed.
 *
 * @see {@link makeOutput} for construction.
 * @see {@link Failure} for a failed report.
 * @stability stable
 * @category models
 */
export class Output<Ext extends Any> extends Data.TaggedClass("Output")<{
  readonly output: Ext["output"]["Type"];
  readonly timestamp?: DateTime.Utc;
  readonly attach?: NonEmptyArray<string>;
}> {}

const reported = {
  timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  attach: Schema.optional(Schema.NonEmptyArray(Schema.String)),
};

const outputSchemaOf = <Ext extends Any>(metric: Ext): OutputSchema<Ext> =>
  Schema.TaggedStruct("Output", { output: metric.output, ...reported });

const failureSchemaOf = <Ext extends Any>(metric: Ext): FailureSchema<Ext> =>
  Schema.TaggedStruct("Failure", { failure: metric.failure, ...reported });

/**
 * Creates an output report without adding a timestamp or attachments.
 *
 * **Gotchas**
 *
 * The options object is required, even when empty.
 * The metric's schema does not validate the value during construction.
 *
 * @see {@link Output} for attachment semantics.
 * @see {@link makeFailure} for a failed report.
 * @stability stable
 * @category constructors
 */
export const makeOutput = <Ext extends Any>(
  output: Ext["output"]["Type"],
  { timestamp, attach }: { timestamp?: DateTime.Utc; attach?: NonEmptyArray<string> },
): Output<Ext> => new Output<Ext>({ output, timestamp, attach });

/**
 * A metric failure reported through a producer's error channel.
 *
 * **Details**
 *
 * Timing and attachments follow {@link Output}.
 * {@link produce} converts this failure into a metric part and ends that producer.
 *
 * @see {@link makeFailure} for construction.
 * @stability stable
 * @category errors
 */
export class Failure<Ext extends Any> extends Data.TaggedClass("Failure")<{
  readonly failure: Ext["failure"]["Type"];
  readonly timestamp?: DateTime.Utc;
  readonly attach?: NonEmptyArray<string>;
}> {}

/**
 * Creates a failure report without adding a timestamp or attachments.
 *
 * **Gotchas**
 *
 * The options object is required, even when empty.
 * The metric's schema does not validate the value during construction.
 *
 * @see {@link Failure} for producer error handling.
 * @see {@link makeOutput} for a successful report.
 * @stability stable
 * @category constructors
 */
export const makeFailure = <Ext extends Any>(
  failure: Ext["failure"]["Type"],
  { timestamp, attach }: { timestamp?: DateTime.Utc; attach?: NonEmptyArray<string> },
): Failure<Ext> => new Failure<Ext>({ failure, timestamp, attach });

/**
 * A metric computation over finished trajectory parts.
 *
 * **Details**
 *
 * The producer preserves upstream errors and requirements.
 * It emits {@link Output} values and can fail with {@link Failure}.
 *
 * **Gotchas**
 *
 * An attachment must name an already consumed part or a declared session.
 * The producer must not require services beyond the input stream's requirements.
 *
 * @see {@link produce} for running the producers of a kit.
 * @see {@link MetricKit.toProducers} for registering producers.
 * @stability stable
 * @category models
 */
export type Producer<Ext extends Any> = <E, R>(
  trajectory: Trajectory.TrajectoryStream<Config.AnyConfig, E, R>,
) => Stream.Stream<Output<Ext>, E | TrajectoryError | Failure<Ext>, R>;

type OutputSchema<Ext extends Any> = Schema.TaggedStruct<
  "Output",
  { readonly output: Ext["output"] } & typeof reported
>;

type FailureSchema<Ext extends Any> = Schema.TaggedStruct<
  "Failure",
  { readonly failure: Ext["failure"] } & typeof reported
>;

type ProducedSchema<Ext extends Any> = Schema.Union<
  readonly [OutputSchema<Ext>, FailureSchema<Ext>]
>;

const produced = <Ext extends Any>(metric: Ext): ProducedSchema<Ext> =>
  Schema.Union([outputSchemaOf(metric), failureSchemaOf(metric)]);

type MetricPartSchema<Ext> = Ext extends Any
  ? Schema.TaggedStruct<Ext["tag"], { readonly data: ProducedSchema<Ext> }>
  : never;

type MetricPartSchemas<Metrics extends Record<string, Any>> = MetricPartSchema<
  Metrics[keyof Metrics]
>;

type MetricPartOf<Ext> = Ext extends Any
  ? MetricPart<Ext["tag"], Output<Ext> | Failure<Ext>>
  : never;

/**
 * Tagged output and failure reports of a record of {@link Metric} declarations.
 *
 * @see {@link MetricParts} for the schema built from a kit.
 * @stability stable
 * @category models
 */
export type MetricParts<Metrics extends Record<string, Any>> = MetricPartOf<Metrics[keyof Metrics]>;

/**
 * Creates a union schema for the metric reports declared by `kit`.
 *
 * **Details**
 *
 * Each tagged payload accepts an output or a failure.
 * An empty kit accepts no metric reports.
 *
 * @see {@link MetricPart} for a single report schema.
 * @stability stable
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
 * Runs kit producers over a shared reading of trajectory parts.
 *
 * **When to use**
 *
 * Use to read metric reports without retaining the input parts in the output.
 *
 * **Details**
 *
 * Producers run concurrently, so reports from different producers can interleave.
 * A {@link Failure} becomes one report and ends only its producer.
 * Other errors fail the resulting stream.
 *
 * **Gotchas**
 *
 * An empty producer record returns an empty stream without reading the input.
 * Producer broadcasts use unbounded buffers.
 * A slow producer can retain an unbounded backlog.
 *
 * @see {@link MetricKit.WithProducers} for the required kit.
 * @stability stable
 * @category metrics
 */
export const produce =
  <K extends MetricKit.Any>({ producers }: MetricKit.WithProducers<K>) =>
  <Config extends Config.AnyConfig, E, R>(
    produced: Trajectory.TrajectoryStream<Config, E, R>,
  ): Stream.Stream<MetricParts<K["metrics"]>, E | TrajectoryError, R> =>
    runProducers(producers, produced);
