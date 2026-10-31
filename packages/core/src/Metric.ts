/**
 * Versioned metric declarations, results, and stream producers.
 *
 * {@link Metric} declares output and failure schemas.
 * {@link MetricSchema} states one declaration as a stored header holds it.
 * {@link produce} runs kit producers and emits tagged results.
 *
 * @stability stable
 */

import { PackageMetadata } from "@trajs/utils/Package";
import { Data, DateTime, Schema, Stream } from "effect";
import type { NonEmptyArray } from "effect/Array";

import type * as Config from "#/Config.ts";
import { runProducers } from "#/internal/metric.ts";
import { documentOf, requireBinaryLayout } from "#/internal/schema.ts";
import type * as MetricKit from "#/MetricKit.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

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

type Fields<
  Pkg extends string,
  Id extends string,
  Output extends Schema.Top,
  Failure extends Schema.Top,
> = {
  packageName: Pkg;
  id: Id;
  metadata?: Metadata;
  packageMetadata?: PackageMetadata;
  output: Output;
  failure: Failure;
};

/**
 * A metric declaration with output and failure schemas.
 *
 * **Details**
 *
 * `tag` joins `packageName` and `id` with `/`.
 * Kits and metric parts use this tag as the metric's identity.
 * The declaration does not contain a producer.
 * Result schemas built with `VersionedSchema.make` read historical results.
 * `packageMetadata` is what the declaring package states of itself.
 *
 * **Gotchas**
 *
 * Construction throws a `TrajectoryError` for a schema `SchemaBinary` cannot lay out.
 *
 * @see {@link make} for building a declaration from its fields.
 * @see {@link makeUnknown} for a metric named without its result schemas.
 * @see {@link MetricKit.toProducers} for associating producers with declarations.
 * @see {@link Output} for successful results.
 * @see {@link Failure} for failed results.
 * @stability stable
 * @category models
 */
export class Metric<
  Pkg extends string,
  Id extends string,
  Output extends Schema.Top,
  Failure extends Schema.Top,
> extends Data.Class<Fields<Pkg, Id, Output, Failure>> {
  constructor(fields: Fields<Pkg, Id, Output, Failure>) {
    super(fields);

    requireBinaryLayout(fields.output);
    requireBinaryLayout(fields.failure);
  }

  get tag(): `${Pkg}/${Id}` {
    return `${this.packageName}/${this.id}`;
  }
}

/**
 * A {@link Metric} without specific identity or result types.
 *
 * @stability stable
 * @category utility types
 */
export type Any = Metric<string, string, Schema.Top, Schema.Top>;

/**
 * Creates a metric declaration from the fields it states.
 *
 * **Details**
 *
 * `metadata` and `packageMetadata` are optional.
 *
 * @see {@link makeUnknown} for a metric named without its result schemas.
 * @see {@link Metric} for the declaration those fields make.
 * @stability stable
 * @category constructors
 */
export const make = <
  Pkg extends string,
  Id extends string,
  Output extends Schema.Top,
  Failure extends Schema.Top,
>(
  fields: Fields<Pkg, Id, Output, Failure>,
): Metric<Pkg, Id, Output, Failure> => new Metric(fields);

/**
 * Declares a metric whose output and failure schemas accept any data.
 *
 * **When to use**
 *
 * Use where a kit names a metric whose result schemas the caller does not hold.
 *
 * **Details**
 *
 * Identity is all the declaration states, so no result field is checked.
 *
 * @see {@link make} for a declaration with its result schemas.
 * @see {@link MetricKit.make} for collecting declarations.
 * @stability stable
 * @category constructors
 */
export const makeUnknown = <Pkg extends string, Id extends string>(
  packageName: Pkg,
  id: Id,
): Metric<Pkg, Id, typeof Schema.Unknown, typeof Schema.Unknown> =>
  make({ packageName, id, output: Schema.Unknown, failure: Schema.Unknown });

/**
 * Schema for a stored metric declaration.
 *
 * **Details**
 *
 * The declaration states the package it is in and its result schemas.
 * `metadata` and `packageMetadata` are optional.
 * Output and failure schemas are stored as JSON, as `Schema.Json` accepts.
 *
 * @see {@link encode} for storing a declaration.
 * @see {@link MetricKit.MetricKitSchema} for the record a stored header holds.
 * @stability stable
 * @category schemas
 */
export const MetricSchema = Schema.Struct({
  metadata: Schema.optional(Metadata),
  packageMetadata: Schema.optional(PackageMetadata),
  output: Schema.Json,
  failure: Schema.Json,
});

/**
 * A stored metric declaration without its decoding schemas.
 *
 * @see {@link MetricSchema} for the schema.
 * @stability stable
 * @category models
 */
export type MetricSchema = Schema.Schema.Type<typeof MetricSchema>;

/**
 * Converts a metric declaration into its stored form.
 *
 * **When to use**
 *
 * Use to describe a metric without its decoding schemas.
 *
 * **Details**
 *
 * Output and failure schemas become JSON, as `Schema.Json` accepts.
 *
 * **Gotchas**
 *
 * Building a document can throw for a schema it cannot state.
 * The result states the encoded side, not the decoding transformations.
 *
 * @see {@link MetricSchema} for the stored form.
 * @see {@link MetricKit.encode} for the stored form of a whole kit.
 * @stability stable
 * @category encoding
 */
export const encode = (metric: Any): MetricSchema => ({
  metadata: metric.metadata,
  packageMetadata: metric.packageMetadata,
  output: documentOf(metric.output),
  failure: documentOf(metric.failure),
});

/**
 * A metric result identified by its declaration's tag.
 *
 * @see {@link MetricPart} for the schema.
 * @stability stable
 * @category models
 */
export type MetricPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

/**
 * Creates a schema for a tagged metric result.
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
 * A successful metric result with optional timing and attachments.
 *
 * **Details**
 *
 * `attach` names the parts the result is about, by uuid.
 * A result belongs to the sessions of the parts it names.
 * Omitting `attach` leaves the result trajectory-wide.
 * Omitting `timestamp` leaves the result untimed.
 *
 * @see {@link makeOutput} for construction.
 * @see {@link Failure} for a failed result.
 * @stability stable
 * @category models
 */
export class Output<Ext extends Any> extends Data.TaggedClass("Output")<{
  readonly output: Ext["output"]["Type"];
  readonly timestamp?: DateTime.Utc;
  readonly attach?: NonEmptyArray<string>;
}> {}

const resultFields = {
  timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  attach: Schema.optional(Schema.NonEmptyArray(Schema.String)),
};

const outputSchemaOf = <Ext extends Any>(metric: Ext): OutputSchema<Ext> =>
  Schema.TaggedStruct("Output", { output: metric.output, ...resultFields });

const failureSchemaOf = <Ext extends Any>(metric: Ext): FailureSchema<Ext> =>
  Schema.TaggedStruct("Failure", { failure: metric.failure, ...resultFields });

/**
 * Creates a successful result without adding a timestamp or attachments.
 *
 * **Gotchas**
 *
 * The options object is required, even when empty.
 * The metric's schema does not validate the value during construction.
 *
 * @see {@link Output} for attachment semantics.
 * @see {@link makeFailure} for a failed result.
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
 * Creates a failed result without adding a timestamp or attachments.
 *
 * **Gotchas**
 *
 * The options object is required, even when empty.
 * The metric's schema does not validate the value during construction.
 *
 * @see {@link Failure} for producer error handling.
 * @see {@link makeOutput} for a successful result.
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
 * An attachment must name an already consumed part.
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
  { readonly output: Ext["output"] } & typeof resultFields
>;

type FailureSchema<Ext extends Any> = Schema.TaggedStruct<
  "Failure",
  { readonly failure: Ext["failure"] } & typeof resultFields
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
 * Tagged results, successful or failed, of a record of {@link Metric} declarations.
 *
 * @see {@link MetricParts} for the schema built from a kit.
 * @stability stable
 * @category models
 */
export type MetricParts<Metrics extends Record<string, Any>> = MetricPartOf<Metrics[keyof Metrics]>;

/**
 * Creates a union schema for the metric results declared by `kit`.
 *
 * **Details**
 *
 * Each tagged payload accepts an output or a failure.
 * An empty kit accepts no metric results.
 *
 * @see {@link MetricPart} for a single result schema.
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
 * Use to read metric results without retaining the input parts in the output.
 *
 * **Details**
 *
 * Producers run concurrently, so results from different producers can interleave.
 * A {@link Failure} becomes one result and ends only its producer.
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
