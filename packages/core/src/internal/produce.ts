import { Effect, Stream } from "effect";

import type * as Config from "#/Config.ts";
import * as Metric from "#/Metric.ts";
import type * as MetricKit from "#/MetricKit.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

export const produceParts =
  <Config extends Config.AnyConfig, Metrics extends Record<string, Metric.Any>>(
    config: Config,
    metrickit: MetricKit.WithProducers<MetricKit.MetricKit<Metrics>>,
  ) =>
  <E, R>(
    stream: Trajectory.TrajectoryStream<Config, E, R>,
  ): Stream.Stream<Trajectory.Part<Config>, E | TrajectoryError, R> => {
    const parts = Trajectory.parts(config);

    return stream.pipe(
      // A trajectory of a run cannot be read from its source again.
      Stream.broadcastN({ n: 2, capacity: "unbounded" }),
      Effect.map(([trajectory, copy]) =>
        Stream.merge(
          trajectory,
          copy.pipe(
            // Producers read whole parts, so streamed increments are folded first.
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
