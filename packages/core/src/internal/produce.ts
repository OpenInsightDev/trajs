/**
 * The parts of a trajectory with the metric parts a kit produces of them merged in.
 *
 * The trajectory is read once. One subscription is shared between the parts a trajectory
 * is answered with and the producers of the kit reading them, because a trajectory of a
 * run is read once rather than asked again for what it holds.
 *
 * A metric part is emitted as it is produced. Its producer has read the parts it names by
 * then, so a reading of the trajectory holds it.
 *
 * Nothing here is published: a program reaches the reading through `Produce`.
 */

import { Effect, Stream } from "effect";

import type * as Config from "#/Config.ts";
import * as Metric from "#/Metric.ts";
import type * as MetricKit from "#/MetricKit.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The parts of `stream` with the metric parts `metrickit` produces of them merged in as
 * they are produced, rather than appended once the trajectory ends.
 */
export const produceParts =
  <Config extends Config.AnyConfig, Metrics extends Record<string, Metric.Any>>(
    config: Config,
    metrickit: MetricKit.WithProducers<MetricKit.Kit<Metrics>>,
  ) =>
  <E, R>(
    stream: Trajectory.TrajectoryStream<Config, E, R>,
  ): Stream.Stream<Trajectory.Part<Config>, E | TrajectoryError, R> => {
    const parts = Trajectory.parts(config);

    return stream.pipe(
      // The trajectory is read twice, as its parts and by the producers of the metrics, so
      // one subscription is shared rather than the source read again, which a trajectory
      // of a run cannot be.
      Stream.broadcastN({ n: 2, capacity: "unbounded" }),
      Effect.map(([held, producing]) =>
        Stream.merge(
          held,
          producing.pipe(
            // A producer reads whole parts, so the increments a streamed response
            // arrived in are folded before one reads them.
            Metric.produce(metrickit),
            // SAFETY: every metric of the kit given is one the config given states.
            Stream.map((metric) =>
              parts.metric(metric as Metric.MetricParts<Config.MetricsOf<Config>>),
            ),
          ),
        ),
      ),
      Stream.unwrap,
    );
  };
