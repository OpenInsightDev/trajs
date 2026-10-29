/**
 * Metric results over trajectory parts, read on their own or with the parts they name.
 *
 * {@link metricOutputs} selects one metric's results and {@link metricTrajectory} carries
 * each result with the part it attaches to.
 *
 * @stability stable
 */

import { Effect, Predicate, Result, Stream } from "effect";

import * as Cache from "#/Cache.ts";
import * as Config from "#/Config.ts";
import type * as Metric from "#/Metric.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import { metricStream } from "#/view/internal/metric.ts";

/**
 * Selects successful results for one metric in input order.
 *
 * **When to use**
 *
 * Use to consume a metric's outputs without matching its tag manually.
 *
 * **Details**
 *
 * Results from other metrics and failed results are omitted.
 * Values are selected by tag without schema validation.
 *
 * @see {@link Metric.Output} for timing and attachment fields.
 * @see {@link metricTrajectory} for reading results with the parts they name.
 * @stability stable
 * @category filtering
 */
export const metricOutputs =
  <Ext extends Metric.Any>(metric: Ext) =>
  <Config extends Config.AnyConfig, E, R>(
    stream: Stream.Stream<Trajectory.Part<Config>, E, R>,
  ): Stream.Stream<Metric.Output<Ext>, E, R> =>
    stream.pipe(
      Stream.filterMap((part) => {
        if (
          !Predicate.isTagged("Metric")(part) ||
          part.metric._tag !== metric.tag ||
          !Predicate.isTagged("Output")(part.metric.data)
        ) {
          return Result.failVoid;
        }

        // SAFETY: the metric part is tagged with `metric.tag`, so its output is that metric's.
        return Result.succeed(part.metric.data as Metric.Output<Ext>);
      }),
    );

/**
 * The metric part of the metric `Tag` names, carrying that metric's payload.
 */
type ResultOf<Config extends Config.AnyConfig, Tag extends keyof Config.MetricsOf<Config>> = Omit<
  Trajectory.MetricPartOf<Config>,
  "metric"
> &
  Readonly<{
    metric: Extract<Trajectory.MetricPartOf<Config>["metric"], { readonly _tag: Tag }>;
  }>;

/**
 * The results attached to one part, keyed by metric tag, each list in trajectory order.
 *
 * **Details**
 *
 * A key is present only for a metric that reported on the part.
 * Each list holds the results of the metric of that tag.
 *
 * @see {@link metricTrajectory} for how results reach a part.
 * @stability stable
 * @category models
 */
export type AttachedMetrics<Config extends Config.AnyConfig> = Readonly<{
  [Tag in keyof Config.MetricsOf<Config>]?: ReadonlyArray<ResultOf<Config, Tag>>;
}>;

/**
 * A part with the results attached to it, or a result without attachments.
 *
 * @see {@link metricTrajectory} for routing results to target parts.
 * @stability stable
 * @category models
 */
export type MetricTrajectoryPart<Config extends Config.AnyConfig> =
  | (AttachablePart<Config> & Readonly<{ metrics: AttachedMetrics<Config> }>)
  | Trajectory.MetricPartOf<Config>;

type AttachablePart<Config extends Config.AnyConfig> =
  | Trajectory.PromptPartOf<Config>
  | Trajectory.SessionPartOf<Config>
  | Trajectory.ResponsePartOf<Config>
  | Trajectory.EventPartOf<Config>;

/**
 * A trajectory view carrying the results attached to each part.
 *
 * @see {@link MetricTrajectoryPart} for each emitted value.
 * @see {@link metricTrajectory} for construction.
 * @stability stable
 * @category models
 */
export type MetricTrajectoryStream<
  Config extends Config.AnyConfig,
  E = never,
  R = never,
> = Stream.Stream<MetricTrajectoryPart<Config>, E, R>;

/**
 * Reads a trajectory into parts carrying the results attached to them.
 *
 * **When to use**
 *
 * Use to display a part together with the results that name it.
 *
 * **Details**
 *
 * {@link Cache.Cache} reads the trajectory to completion before any part is emitted.
 * A scan of the cached parts indexes each result by the uuid of the parts it names.
 * A non-metric part carries `metrics`, a record from metric tag to the results naming its uuid.
 * Reading one metric's results needs only `metrics[tag]`.
 * Results without `attach` remain in the stream.
 * Results with `attach` leave the stream for the `metrics` of the parts they name.
 * Repeated target ids within one result attach once.
 *
 * **Gotchas**
 *
 * The entire trajectory is read before the first part is emitted.
 * An infinite trajectory never emits.
 * An attachment names a part uuid.
 * An unknown target attaches nothing.
 * Reading requires the cache's backing store to remain available.
 *
 * @see {@link metricOutputs} for selecting metric outputs directly.
 * @see {@link Cache.Cache} for the service the reading runs in.
 * @stability stable
 * @category transforming
 */
export const metricTrajectory = Effect.fn(function* <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.fn.Return<
  MetricTrajectoryStream<
    Config,
    TrajectoryError | Cache.CacheError,
    Config.DecodingServices<Config>
  >,
  E | TrajectoryError | Cache.CacheError,
  R | Cache.Cache | Config.SchemaServices<Config>
> {
  const cache = yield* Cache.Cache;
  const cached = yield* cache.cache(trajectory);

  return yield* metricStream(cached);
});
