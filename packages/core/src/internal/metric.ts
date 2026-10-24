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

const isProducerFailure = (value: unknown): value is ProducerFailure<Any> =>
  Predicate.isTagged("ProducerFailure")(value) && Predicate.hasProperty(value, "failure");

export const runProducers = <
  Metrics extends Record<string, Any>,
  Config extends Config.AnyConfig,
  E,
  R,
>(
  producers: Producers<Metrics>,
  produced: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<MetricParts<Metrics>, E | TrajectoryError, R> => {
  // A producer is read from a kit by tag alone, so the kit is read as the record of
  // producers it is keyed as rather than as the parts its metrics make.
  const byTag: Readonly<Record<string, Producer<Any>>> = producers;
  const tags = Object.keys(byTag);

  if (tags.length === 0) {
    return Stream.empty;
  }

  // SAFETY: every report is emitted under the tag of the metric it is reported by,
  // which is the part the kit holds of that metric — one part per metric it names.
  return foldParts(produced).pipe(
    Stream.broadcastN({ n: tags.length, capacity: "unbounded" }),
    Effect.map((readings) =>
      Stream.mergeAll(
        tags.map((tag, index) =>
          byTag[tag](readings[index]).pipe(
            Stream.map((reported) => ({ _tag: tag, data: reported })),
            Stream.catchIf(isProducerFailure, (failure) =>
              Stream.make({ _tag: tag, data: failure }),
            ),
          ),
        ),
        { concurrency: "unbounded" },
      ),
    ),
    Stream.unwrap,
  ) as Stream.Stream<MetricParts<Metrics>, E | TrajectoryError, R>;
};
