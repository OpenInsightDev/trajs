/**
 * The reading behind {@link Metric.produce}: the producers of a kit run over one
 * trajectory, each report emitted under the tag of the metric it is reported by — a
 * failure a producer derived of a part produced as the data of that metric rather
 * than failing the run.
 *
 * Nothing here is published: a program reaches the reading through
 * {@link Metric.produce}.
 */

import { Effect, Predicate, Stream } from "effect";

import * as Config from "#/Config.ts";
import { foldParts } from "#/internal/folding.ts";
import type { Any, MetricParts, Producer, ProducerFailure } from "#/Metric.ts";
import type { Producers } from "#/MetricKit.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * Whether a value is the failure a producer derived of a part, rather than the
 * failure of the run: only the former is a `ProducerFailure`, which is tagged as one
 * and carries the metric's own failure.
 */
const isProducerFailure = (value: unknown): value is ProducerFailure<Any> =>
  Predicate.isTagged("ProducerFailure")(value) && Predicate.hasProperty(value, "failure");

/**
 * Runs every producer of a kit over a trajectory, reporting what each of them derived
 * of it as the part of the metric that producer belongs to.
 */
export const runProducers = <
  Metrics extends Record<string, Any>,
  Config extends Config.AnyConfig,
  E,
  R,
>(
  producers: Producers<Metrics>,
  produced: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<MetricParts<Metrics>, E | TrajectoryError, R> => {
  const tags = Object.keys(producers);

  // A kit that names no metric derives nothing of a trajectory, so it reads none
  // of one.
  if (tags.length === 0) {
    return Stream.empty;
  }

  // SAFETY: every report is emitted under the tag of the metric it is reported by,
  // which is the part the kit holds of that metric — one part per metric it names.
  return foldParts(produced).pipe(
    // A producer reads the trajectory for the parts it measures, so the parts are
    // served to the producers rather than read by each of them: a stream serves
    // a single reading, and a trajectory read for what a kit derives of it
    // arrives in one that is the branch of a broadcast.
    Stream.broadcastN({ n: tags.length, capacity: "unbounded" }),
    Effect.map((readings) =>
      Stream.mergeAll(
        tags.map((tag, index) => {
          // SAFETY: a kit states its producers keyed as its metrics are, so the
          // producer at a tag reports the data of the metric at its own tag.
          const report = (producers as Record<string, Producer<Any>>)[tag]!;

          return report(readings[index]).pipe(
            Stream.map((reported) => ({ _tag: tag, data: reported })),
            // The failure a producer derived is the data of its metric, so it is
            // produced as a metric part rather than failing the run.
            Stream.catchIf(isProducerFailure, (failure) =>
              Stream.make({ _tag: tag, data: failure }),
            ),
          );
        }),
        { concurrency: "unbounded" },
      ),
    ),
    Stream.unwrap,
  ) as Stream.Stream<MetricParts<Metrics>, E | TrajectoryError, R>;
};
