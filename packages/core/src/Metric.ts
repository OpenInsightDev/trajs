import { Data, DateTime, Schema, Stream } from "effect";
import type { NonEmptyArray } from "effect/Array";

import * as Config from "#/Config.ts";
import { runProducers } from "#/internal/metric.ts";
import type * as MetricKit from "#/MetricKit.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

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

export type MetricPart<Tag extends string, Data> = Readonly<{ _tag: Tag; data: Data }>;

export const MetricPart = <Tag extends string, S extends Schema.Top>(
  tag: Tag,
  schema: S,
): Schema.TaggedStruct<Tag, { readonly data: S }> => Schema.TaggedStruct(tag, { data: schema });

export class ProducerOutput<Ext extends Any> extends Data.TaggedClass("ProducerOutput")<{
  readonly output: Output<Ext>["Type"];
  readonly timestamp?: DateTime.Utc;
  readonly attach: NonEmptyArray<string>;
}> {}

const reported = {
  timestamp: Schema.optional(Schema.DateTimeUtcFromString),
  attach: Schema.NonEmptyArray(Schema.String),
};

const outputSchemaOf = <Ext extends Any>(metric: Ext): OutputSchema<Ext> =>
  Schema.TaggedStruct("ProducerOutput", { output: metric.output, ...reported });

const failureSchemaOf = <Ext extends Any>(metric: Ext): FailureSchema<Ext> =>
  Schema.TaggedStruct("ProducerFailure", { failure: metric.failure, ...reported });

export const makeOutput = <Ext extends Any>(
  output: Output<Ext>["Type"],
  { timestamp, attach }: { timestamp?: DateTime.Utc; attach: NonEmptyArray<string> },
): ProducerOutput<Ext> => new ProducerOutput<Ext>({ output, timestamp, attach });

export class ProducerFailure<Ext extends Any> extends Data.TaggedClass("ProducerFailure")<{
  readonly failure: Failure<Ext>["Type"];
  readonly timestamp?: DateTime.Utc;
  readonly attach: NonEmptyArray<string>;
}> {}

export const makeFailure = <Ext extends Any>(
  failure: Failure<Ext>["Type"],
  { timestamp, attach }: { timestamp?: DateTime.Utc; attach: NonEmptyArray<string> },
): ProducerFailure<Ext> => new ProducerFailure<Ext>({ failure, timestamp, attach });

export type Producer<Ext extends Any> = <E, R>(
  trajectory: Trajectory.TrajectoryStream<Config.NonStreamConfig, E, R>,
) => Stream.Stream<ProducerOutput<Ext>, E | TrajectoryError | ProducerFailure<Ext>, R>;

type OutputSchema<Ext extends Any> = Schema.TaggedStruct<
  "ProducerOutput",
  { readonly output: Output<Ext> } & typeof reported
>;

type FailureSchema<Ext extends Any> = Schema.TaggedStruct<
  "ProducerFailure",
  { readonly failure: Failure<Ext> } & typeof reported
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
  ? MetricPart<Ext["tag"], ProducerOutput<Ext> | ProducerFailure<Ext>>
  : never;

export type MetricParts<Metrics extends Record<string, Any>> = MetricPartOf<Metrics[keyof Metrics]>;

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

export const produce =
  <K extends MetricKit.Any>({ producers }: MetricKit.WithProducers<K>) =>
  <Config extends Config.AnyConfig, E, R>(
    produced: Trajectory.TrajectoryStream<Config, E, R>,
  ): Stream.Stream<MetricParts<K["metrics"]>, E | TrajectoryError, R> =>
    runProducers(producers, produced);
