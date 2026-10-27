import { Effect, Predicate, Stream } from "effect";

import * as Config from "#/Config.ts";
import type { Any, MetricParts, Producer, Failure } from "#/Metric.ts";
import type { Producers } from "#/MetricKit.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

const isFailure = (value: unknown): value is Failure<Any> =>
  Predicate.isTagged("Failure")(value) && Predicate.hasProperty(value, "failure");

export const runProducers = <
  Metrics extends Record<string, Any>,
  Config extends Config.AnyConfig,
  E,
  R,
>(
  producers: Producers<Metrics>,
  produced: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<MetricParts<Metrics>, E | TrajectoryError, R> => {
  const byTag: Readonly<Record<string, Producer<Any>>> = producers;
  const tags = Object.keys(byTag);

  if (tags.length === 0) {
    return Stream.empty;
  }

  // SAFETY: each report uses the tag of its metric.
  // That tag is the metric part the kit holds.
  // The kit has one part per metric.
  return produced.pipe(
    Stream.broadcastN({ n: tags.length, capacity: "unbounded" }),
    Effect.map((streams) =>
      Stream.mergeAll(
        tags.map((tag, index) =>
          byTag[tag](streams[index]).pipe(
            Stream.map((reported) => ({ _tag: tag, data: reported })),
            Stream.catchIf(isFailure, (failure) => Stream.make({ _tag: tag, data: failure })),
          ),
        ),
        { concurrency: "unbounded" },
      ),
    ),
    Stream.unwrap,
  ) as Stream.Stream<MetricParts<Metrics>, E | TrajectoryError, R>;
};
