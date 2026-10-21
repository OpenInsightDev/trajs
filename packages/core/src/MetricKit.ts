/**
 * Metrics collected into a kit: what a reading of a trajectory derives, keyed by the
 * tag each metric reports under.
 *
 * {@link make} collects the metrics an extension declares ({@link Metric.Metric})
 * into a kit, {@link merge} adds the metrics of one kit to another's, and
 * {@link empty} names none. {@link toProducers} provides a kit with the producer of
 * each of its metrics, so that what the kit derives of a trajectory can be produced
 * as parts of it ({@link Metric.produce}). A kit is what a trajectory is read with —
 * the `metrickit` of its {@link Trajectory.Config} — so the metrics a reading knows
 * are the metrics its kit names.
 *
 * {@link Metric.MetricParts} reads a trajectory's metric parts under a kit.
 */

import { Predicate } from "effect";

import type { IndexByKey } from "#/internal/types.ts";
import type * as Metric from "#/Metric.ts";

/** The metrics of the metrics given, keyed by the tag each names. */
type MetricsByTag<Ms> = IndexByKey<Ms, "tag">;

/**
 * A kit of metrics, keyed by the tag each names.
 *
 * **When to use**
 *
 * Use to name the metrics a trajectory is read with — a field of a config, or the
 * parameter of a function that reads parts under one.
 *
 * @see {@link make} for building one, {@link toProducers} for providing it.
 * @category models
 */
export type Kit<Metrics extends Record<string, Metric.Any>> = Readonly<{
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
 * names the metrics it was given and no others; {@link empty} names none.
 *
 * @see {@link merge} for adding the metrics of one kit to another's.
 * @see {@link toProducers} for providing a kit with a producer per metric.
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
  return { metrics: output } as Kit<MetricsByTag<Ms>>;
};

/**
 * A kit whose metrics are not known.
 *
 * @category models
 */
export type Any = Kit<Record<string, Metric.Any>>;

/**
 * A kit that declares no metric.
 *
 * @category constants
 */
export const empty = make();

/**
 * The type of {@link empty}.
 *
 * @category utility types
 */
export type Empty = typeof empty;

/** The metrics of the kits given as one, a tag they share holding the metric of the kit latest among them. */
type MetricsMerged<Ks extends ReadonlyArray<Any>> = Ks extends readonly [
  infer Head extends Any,
  ...infer Tail extends ReadonlyArray<Any>,
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
type ProducersMerged<Ks extends ReadonlyArray<WithProducers<Any>>> = Ks extends readonly [
  infer Head extends WithProducers<Any>,
  ...infer Tail extends ReadonlyArray<WithProducers<Any>>,
]
  ? Omit<Head["producers"], keyof ProducersMerged<Tail>> & ProducersMerged<Tail>
  : {};

/**
 * The kit the kits given make, as one: every metric they name, a shared tag holding
 * the metric of the latest kit that names it.
 *
 * **When to use**
 *
 * Use to type the kit {@link merge} returns.
 *
 * **Details**
 *
 * Every kit's metrics are named; where two kits name the same tag, the metric of
 * the later kit wins.
 *
 * A merged kit states the producers of the kits given only where every one of them
 * states all of its own, and states none otherwise: a kit whose producers cover
 * some of its metrics alone is not one {@link Metric.produce} can run. See
 * {@link WithProducers}.
 *
 * @see {@link merge} for the kit it types.
 * @see {@link WithProducers} for the kit a metric is reported by a producer of.
 * @category models
 */
export type Merged<Ks extends ReadonlyArray<Any>> =
  Ks extends ReadonlyArray<WithProducers<Any>>
    ? Kit<MetricsMerged<Ks>> & { readonly producers: ProducersMerged<Ks> }
    : Kit<MetricsMerged<Ks>>;

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
 * {@link Merged} says.
 *
 * **Example** (Adding the metrics of one kit to another's)
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
 * const merged = MetricKit.merge(MetricKit.make(count), MetricKit.make(cost))
 * Object.keys(merged.metrics) // => ["tokenize/count", "pricing/cost"]
 * ```
 *
 * @see {@link make} for a kit of the metrics given alone.
 * @see {@link Merged} for the kit it returns.
 * @category constructors
 */
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
 * An entry is the {@link Metric.Producer} of the metric at the same key (the
 * metric's tag), so a producer is checked against its metric: what it reports must
 * match that metric's schemas. Every metric is an entry, so there is nothing to leave
 * out.
 *
 * @see {@link toProducers} for providing a kit with them.
 * @category models
 */
export type Producers<Metrics extends Record<string, Metric.Any>> = Readonly<{
  [Ext in Metrics[keyof Metrics] as Ext["tag"]]: Metric.Producer<Ext>;
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
 * It is the kit itself with the producers of its metrics beside them, keyed as
 * those metrics are, so each metric is reported by the producer at its tag and none
 * is left without one. The producers are held beside the metrics rather than
 * standing for them because a producer does not name its own metric: its key does.
 *
 * @see {@link toProducers} for building one.
 * @see {@link Metric.produce} for running it.
 * @category models
 */
export type WithProducers<K extends Any> = K & {
  readonly producers: Producers<K["metrics"]>;
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
 * The producers are checked against the kit — an entry is the producer of the
 * metric at its key — so a producer that reports another metric's data fails to
 * compile rather than to run. What a producer is built with, and what building it
 * fails with, are read where it is built and are not properties of the kit. The kit
 * is carried through as it was given.
 *
 * **Example** (Providing a kit with the producer of its metric)
 *
 * ```ts import.meta.vitest
 * import { Schema, Stream } from "effect"
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
 * // What the metric is reported by: the count of each part it was derived for. A
 * // producer is typed where it is written, since what it reports is the data of
 * // the metric it is keyed by.
 * const counting: Metric.Producer<typeof count> = () => Stream.empty
 *
 * const runnable = MetricKit.toProducers(MetricKit.make(count), {
 *   "tokenize/count": counting
 * })
 * Object.keys(runnable.producers) // => ["tokenize/count"]
 * ```
 *
 * @see {@link Producers} for the producers it takes.
 * @see {@link WithProducers} for the kit it returns.
 * @see {@link Metric.produce} for running the kit it returns.
 * @category constructors
 */
export const toProducers = <K extends Any>(
  kit: K,
  producers: Producers<K["metrics"]>,
): WithProducers<K> => ({ ...kit, producers });
