import { Predicate, type Schema } from "effect";

import type { IndexByKey } from "#/internal/types.ts";
import type * as Metric from "#/Metric.ts";

type MetricsByTag<Ms> = IndexByKey<Ms, "tag">;

export type Kit<Metrics extends Record<string, Metric.Any>> = Readonly<{
  metrics: Metrics;
}>;

export const make = <Ms extends ReadonlyArray<Metric.Any>>(...metrics: Ms) => {
  // SAFETY: every metric given is inserted under its own tag below, so what the record
  // holds is one metric per tag the kit names.
  const output = {} as Record<string, Metric.Any>;

  for (const metric of metrics) {
    output[metric.tag] = metric;
  }

  // SAFETY: `output` holds the metric of every tag in `Ms`, which is what `MetricsByTag`
  // reads the metrics given as.
  return { metrics: output } as Kit<MetricsByTag<Ms>>;
};

export type Any = Kit<Record<string, Metric.Any>>;

export const empty = make();

export type Empty = typeof empty;

/**
 * A utility type which extracts the metrics from a {@link Kit}.
 *
 * @see {@link Metric.MetricParts} for the part schema those metrics make
 * @category models
 */
export type Metrics<K> = K extends Kit<infer Metrics> ? Metrics : never;

/**
 * The services that decoding the metric schemas of a {@link Kit} requires.
 *
 * @see {@link EncodingServices} for the services of writing the same schemas
 * @category models
 */
export type DecodingServices<K extends Any> = Schema.Codec.DecodingServices<
  K["metrics"][keyof K["metrics"]]["output"] | K["metrics"][keyof K["metrics"]]["failure"]
>;

/**
 * The services that encoding the metric schemas of a {@link Kit} requires.
 *
 * @see {@link DecodingServices} for the services of reading the same schemas
 * @category models
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

export type Merged<Ks extends ReadonlyArray<Any>> =
  Ks extends ReadonlyArray<WithProducers<Any>>
    ? Kit<MetricsMerged<Ks>> & { readonly producers: ProducersMerged<Ks> }
    : Kit<MetricsMerged<Ks>>;

export const merge = <Ks extends ReadonlyArray<Any>>(...kits: Ks): Merged<Ks> => {
  // SAFETY: every metric of every kit is inserted under its own tag below, so what
  // the record holds is one metric per tag the kits name.
  const metrics = {} as Record<string, Metric.Any>;

  // SAFETY: every producer of every kit that states one is inserted under the tag
  // of the metric it reports below, so what the record holds is one producer per
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

export type Producers<Metrics extends Record<string, Metric.Any>> = Readonly<{
  [Ext in Metrics[keyof Metrics] as Ext["tag"]]: Metric.Producer<Ext>;
}>;

export type WithProducers<K extends Any> = K & {
  readonly producers: Producers<K["metrics"]>;
};

export const toProducers = <K extends Any>(
  kit: K,
  producers: Producers<K["metrics"]>,
): WithProducers<K> => ({ ...kit, producers });
