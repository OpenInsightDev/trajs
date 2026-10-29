/**
 * What the metric view reads of a cached trajectory: the results attached to each part.
 */

import { Effect, Option, Predicate, Result, Stream } from "effect";

import type * as Cache from "#/Cache.ts";
import type * as Config from "#/Config.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import type * as MetricView from "#/view/MetricView.ts";

type Part<Config extends Config.AnyConfig> = Trajectory.Part<Config>;

/** A reading of a cached trajectory, which fails wherever the cache does. */
type Reading<Config extends Config.AnyConfig, A> = Effect.Effect<
  A,
  TrajectoryError | Cache.CacheError,
  Config.DecodingServices<Config>
>;

type MetricStream<Config extends Config.AnyConfig> = MetricView.MetricTrajectoryStream<
  Config,
  TrajectoryError | Cache.CacheError,
  Config.DecodingServices<Config>
>;

/** Metric part indices by the uuid of every part they attach to, in trajectory order. */
type Attachment = Map<string, Array<number>>;

const isMetric = <Config extends Config.AnyConfig>(
  part: Part<Config>,
): part is Trajectory.MetricPartOf<Config> => Predicate.isTagged("Metric")(part);

const attachPart = <Config extends Config.AnyConfig>(
  attached: Attachment,
  part: Part<Config>,
  index: number,
): void => {
  if (!isMetric<Config>(part)) return;

  // A result that names one target twice attaches once.
  for (const target of new Set(part.metric.data.attach ?? [])) {
    const indices = attached.get(target);

    if (indices === undefined) {
      attached.set(target, [index]);
    } else {
      indices.push(index);
    }
  }
};

const record = <Config extends Config.AnyConfig>(
  cached: Cache.Cached<string, Config>,
): Reading<Config, Attachment> =>
  Effect.gen(function* () {
    // One index per reading, so reading the view again starts from no entries.
    const attached: Attachment = new Map();

    yield* cached.pipe(
      Stream.zipWithIndex,
      Stream.runForEach(([part, index]) => Effect.sync(() => attachPart(attached, part, index))),
    );

    return attached;
  });

const metricAt = <Config extends Config.AnyConfig>(
  cached: Cache.Cached<string, Config>,
  index: number,
): Reading<Config, Trajectory.MetricPartOf<Config>> =>
  cached.at(index).pipe(
    Effect.map(Option.filter(isMetric<Config>)),
    // An index is recorded from reading this cache, which held a metric part there.
    Effect.map(Option.getOrThrow),
  );

/** Groups the results of one part by metric tag, each list in trajectory order. */
const byTag = <Config extends Config.AnyConfig>(
  results: ReadonlyArray<Trajectory.MetricPartOf<Config>>,
): MetricView.AttachedMetrics<Config> => {
  const grouped = new Map<string, Array<Trajectory.MetricPartOf<Config>>>();

  for (const result of results) {
    const tag = result.metric._tag;
    const held = grouped.get(tag);

    if (held === undefined) {
      grouped.set(tag, [result]);
    } else {
      held.push(result);
    }
  }

  // SAFETY: each list holds the results of the metric its key names, in trajectory order,
  // which is what the record holds and all it holds. The tags of a config are not known
  // one by one where the config is a type parameter, so the groups cannot be read as the
  // record by type alone.
  return Object.fromEntries<unknown>(grouped) as MetricView.AttachedMetrics<Config>;
};

const metricsOf = <Config extends Config.AnyConfig>(
  cached: Cache.Cached<string, Config>,
  attached: Attachment,
  uuid: string,
): Reading<Config, MetricView.AttachedMetrics<Config>> =>
  Effect.forEach(attached.get(uuid) ?? [], (index) => metricAt(cached, index)).pipe(
    Effect.map(byTag),
  );

/** Keeps a result that names no target, and hands every other part its results. */
const emit = <Config extends Config.AnyConfig>(
  cached: Cache.Cached<string, Config>,
  attached: Attachment,
  part: Part<Config>,
): Reading<Config, Result.Result<MetricView.MetricTrajectoryPart<Config>, void>> => {
  // A result that names a target is emitted with that target rather than last.
  if (isMetric<Config>(part)) {
    return Effect.succeed(
      part.metric.data.attach === undefined ? Result.succeed(part) : Result.failVoid,
    );
  }

  return Effect.map(metricsOf(cached, attached, part.uuid), (metrics) =>
    Result.succeed({ ...part, metrics }),
  );
};

/** Reads the parts of a cached trajectory with the results attached to each of them. */
export const metricStream = <Config extends Config.AnyConfig>(
  cached: Cache.Cached<string, Config>,
): Reading<Config, MetricStream<Config>> =>
  Effect.map(record(cached), (attached) =>
    cached.pipe(Stream.filterMapEffect((part) => emit(cached, attached, part))),
  );
