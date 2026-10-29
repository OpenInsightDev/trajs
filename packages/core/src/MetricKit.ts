/**
 * Metric declarations and their producers collected by tag.
 *
 * {@link make} collects declarations.
 * {@link toProducers} associates a producer with every metric in a kit.
 * {@link MetricKitSchema} states a whole kit as a stored header holds it.
 *
 * @stability stable
 */

import { Predicate, Schema } from "effect";

import type { IndexByKey } from "#/internal/types.ts";
import * as Metric from "#/Metric.ts";

type MetricsByTag<Ms> = IndexByKey<Ms, "tag">;

/**
 * A record of {@link Metric.Metric} declarations keyed by tag.
 *
 * @see {@link make} for construction.
 * @see {@link WithProducers} for executable metrics.
 * @stability stable
 * @category models
 */
export type MetricKit<Metrics extends Record<string, Metric.Any>> = Readonly<{
  metrics: Metrics;
}>;

/**
 * Collects metric declarations under their tags.
 *
 * **Gotchas**
 *
 * The last declaration wins for a repeated tag.
 *
 * @see {@link merge} for combining existing kits.
 * @see {@link toProducers} for supplying producers.
 * @stability stable
 * @category constructors
 */
export const make = <Ms extends ReadonlyArray<Metric.Any>>(...metrics: Ms) => {
  // SAFETY: every metric given is inserted under its own tag below, so what the record
  // holds is one metric per tag the kit names.
  const output = {} as Record<string, Metric.Any>;

  for (const metric of metrics) {
    output[metric.tag] = metric;
  }

  // SAFETY: `output` holds the metric of every tag in `Ms`, which is what `MetricsByTag`
  // reads the metrics given as.
  return { metrics: output } as MetricKit<MetricsByTag<Ms>>;
};

/**
 * A {@link MetricKit} without specific metric types.
 *
 * @stability stable
 * @category utility types
 */
export type Any = MetricKit<Record<string, Metric.Any>>;

/**
 * A metric kit with no declarations or producers.
 *
 * @see {@link toProducers} for a producer-bearing empty kit.
 * @stability stable
 * @category constants
 */
export const empty = make();

/**
 * The type of the declaration-free {@link empty} kit.
 *
 * @stability stable
 * @category utility types
 */
export type Empty = typeof empty;

/**
 * Metric declarations of a {@link MetricKit}, or `never` for another type.
 *
 * @see {@link Metric.MetricParts} for the corresponding tagged results.
 * @stability stable
 * @category utility types
 */
export type Metrics<K> = K extends MetricKit<infer Metrics> ? Metrics : never;

/**
 * Schema requirements for decoding metric outputs and failures of a {@link MetricKit}.
 *
 * @see {@link EncodingServices} for writing the same results.
 * @stability stable
 * @category utility types
 */
export type DecodingServices<K extends Any> = Schema.Codec.DecodingServices<
  K["metrics"][keyof K["metrics"]]["output"] | K["metrics"][keyof K["metrics"]]["failure"]
>;

/**
 * Schema requirements for encoding metric outputs and failures of a {@link MetricKit}.
 *
 * @see {@link DecodingServices} for reading the same results.
 * @stability stable
 * @category utility types
 */
export type EncodingServices<K extends Any> = Schema.Codec.EncodingServices<
  K["metrics"][keyof K["metrics"]]["output"] | K["metrics"][keyof K["metrics"]]["failure"]
>;

type MetricsMerged<Ks extends ReadonlyArray<Any>> = Ks extends readonly [
  infer Head extends Any,
  ...infer Tail extends ReadonlyArray<Any>,
]
  ? Omit<Head["metrics"], keyof MetricsMerged<Tail>> & MetricsMerged<Tail>
  : {};

type ProducersMerged<Ks extends ReadonlyArray<WithProducers<Any>>> = Ks extends readonly [
  infer Head extends WithProducers<Any>,
  ...infer Tail extends ReadonlyArray<WithProducers<Any>>,
]
  ? Omit<Head["producers"], keyof ProducersMerged<Tail>> & ProducersMerged<Tail>
  : {};

/**
 * The {@link MetricKit} produced by merging kits in tuple order.
 *
 * **Details**
 *
 * Producer types survive only when every input has producers.
 *
 * @see {@link merge} for duplicate-tag behavior.
 * @stability stable
 * @category utility types
 */
export type Merged<Ks extends ReadonlyArray<Any>> =
  Ks extends ReadonlyArray<WithProducers<Any>>
    ? MetricKit<MetricsMerged<Ks>> & { readonly producers: ProducersMerged<Ks> }
    : MetricKit<MetricsMerged<Ks>>;

/**
 * Combines the declarations of existing metric kits.
 *
 * **Details**
 *
 * The last kit wins for a repeated tag.
 * Producers are retained only when every input has producers.
 *
 * **Gotchas**
 *
 * One input without producers removes producers from the whole result.
 *
 * @see {@link make} for collecting individual declarations.
 * @see {@link toProducers} for supplying producers.
 * @stability stable
 * @category combining
 */
export const merge = <Ks extends ReadonlyArray<Any>>(...kits: Ks): Merged<Ks> => {
  // SAFETY: every metric of every kit is inserted under its own tag below, so what
  // the record holds is one metric per tag the kits name.
  const metrics = {} as Record<string, Metric.Any>;

  // SAFETY: every producer of every kit that states one is inserted under the tag
  // of the metric it results below, so what the record holds is one producer per
  // tag those kits name.
  const producers = {} as Record<string, Metric.Producer<Metric.Any>>;

  let reported = true;

  for (const kit of kits) {
    Object.assign(metrics, kit.metrics);

    if (!Predicate.hasProperty(kit, "producers")) {
      reported = false;
      continue;
    }

    // SAFETY: a kit that states producers states them keyed as its metrics are —
    // what `WithProducers` is — so what is read off it is a record of producers.
    Object.assign(producers, kit.producers as Record<string, Metric.Producer<Metric.Any>>);
  }

  // SAFETY: a kit that was provided with producers states all of them, which is
  // what `Merged` reads the kits given as where every one of them states them, and
  // a kit merged from one that states none is read as stating none.
  return (reported ? { metrics, producers } : { metrics }) as Merged<Ks>;
};

/**
 * One {@link Metric.Producer} per metric tag.
 *
 * @see {@link toProducers} for attaching this record to a kit.
 * @stability stable
 * @category models
 */
export type Producers<Metrics extends Record<string, Metric.Any>> = Readonly<{
  [Ext in Metrics[keyof Metrics] as Ext["tag"]]: Metric.Producer<Ext>;
}>;

/**
 * A {@link MetricKit} with a producer for every declared metric.
 *
 * @see {@link toProducers} for construction.
 * @see {@link Metric.produce} for running the producers.
 * @stability stable
 * @category models
 */
export type WithProducers<K extends Any> = K & {
  readonly producers: Producers<K["metrics"]>;
};

/**
 * Associates producers with a metric kit.
 *
 * **Details**
 *
 * The producer record uses metric tags as keys.
 * Existing producers are replaced.
 *
 * @see {@link Metric.produce} for producing results.
 * @stability stable
 * @category constructors
 */
export const toProducers = <K extends Any>(
  kit: K,
  producers: Producers<K["metrics"]>,
): WithProducers<K> => ({ ...kit, producers });

/**
 * Schema for the stored metric declarations of a kit, keyed by tag.
 *
 * @see {@link Metric.MetricSchema} for each declaration.
 * @stability stable
 * @category schemas
 */
export const MetricKitSchema = Schema.Record(Schema.String, Metric.MetricSchema);

/**
 * Stored metric declarations keyed by their kit tags.
 *
 * @see {@link MetricKitSchema} for the schema.
 * @stability stable
 * @category models
 */
export type MetricKitSchema = Schema.Schema.Type<typeof MetricKitSchema>;

/**
 * Converts a kit into the stored declarations of its metrics.
 *
 * **When to use**
 *
 * Use to describe the metrics of a kit without their decoding schemas.
 *
 * **Details**
 *
 * Record keys are the tags of the kit.
 *
 * @see {@link MetricKitSchema} for the stored declarations.
 * @see {@link Metric.encode} for a single declaration.
 * @stability stable
 * @category encoding
 */
export const encode = (kit: Any): MetricKitSchema =>
  Object.fromEntries(
    Object.entries(kit.metrics).map(([tag, metric]) => [tag, Metric.encode(metric)]),
  );
