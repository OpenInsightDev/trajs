/**
 * The states {@link View.steps} folds the parts of a session through: the run of
 * responses being assembled and the fold of their streams. The grouping itself is
 * stated by the reader.
 *
 * Nothing here is published: a program reaches the reading through {@link View}.
 */

import { Effect, Stream, SubscriptionRef } from "effect";
import type { Tool } from "effect/ai";

import type * as Config from "#/Config.ts";
import { initial, type State } from "#/internal/folding.ts";
import type * as Response from "#/Response.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type * as View from "#/View.ts";

/** The responses produced together from the parts read so far, and the folding of their stream. */
export interface Run<Tools extends Record<string, Tool.Any>> {
  readonly response: ReadonlyArray<Response.PartView<Tools>>;
  readonly folding: State;
}

/** The run a reading starts from: no response produced. */
export const idle = <Tools extends Record<string, Tool.Any>>(): Run<Tools> => ({
  response: [],
  folding: initial(),
});

export interface Metrics<Config extends Config.AnyConfig> {
  readonly parts: ReadonlyArray<Trajectory.MetricPartOf<Config>>;
  readonly ended: boolean;
}

export type Attachment<Config extends Config.AnyConfig> = Map<
  string,
  SubscriptionRef.SubscriptionRef<Metrics<Config>>
>;

export const attachment = <Config extends Config.AnyConfig>(): Attachment<Config> => new Map();

const refOf = <Config extends Config.AnyConfig>(
  attached: Attachment<Config>,
  uuid: string,
): Effect.Effect<SubscriptionRef.SubscriptionRef<Metrics<Config>>> => {
  const existing = attached.get(uuid);

  if (existing !== undefined) {
    return Effect.succeed(existing);
  }

  return SubscriptionRef.make<Metrics<Config>>({ parts: [], ended: false }).pipe(
    Effect.map((ref) => {
      attached.set(uuid, ref);

      return ref;
    }),
  );
};

const metricsOf = <Config extends Config.AnyConfig>(
  ref: SubscriptionRef.SubscriptionRef<Metrics<Config>>,
): Stream.Stream<Trajectory.MetricPartOf<Config>> =>
  SubscriptionRef.changes(ref).pipe(
    Stream.takeUntil((metrics) => metrics.ended),
    Stream.mapAccum(
      () => 0,
      (seen, metrics) => [metrics.parts.length, metrics.parts.slice(seen)] as const,
    ),
  );

export const attachPart = <Config extends Config.AnyConfig>(
  attached: Attachment<Config>,
  value: Trajectory.Part<Config>,
): Effect.Effect<
  readonly [Attachment<Config>, ReadonlyArray<View.MetricTrajectoryPart<Config>>]
> => {
  if (value._tag === "Metric") {
    const attach = value.metric.data.attach;

    if (attach === undefined) {
      return Effect.succeed([attached, [value]] as const);
    }

    return Effect.forEach(new Set(attach), (uuid) =>
      refOf(attached, uuid).pipe(
        Effect.flatMap((ref) =>
          SubscriptionRef.update(ref, (metrics) => ({
            ...metrics,
            parts: [...metrics.parts, value],
          })),
        ),
      ),
    ).pipe(Effect.as([attached, []] as const));
  }

  return refOf(attached, value.uuid).pipe(
    Effect.map((ref) => [attached, [{ ...value, metrics: metricsOf(ref) }]] as const),
  );
};

export const endAttachment = <Config extends Config.AnyConfig>(
  attached: Attachment<Config>,
): Effect.Effect<void> =>
  Effect.forEach(attached.values(), (ref) =>
    SubscriptionRef.update(ref, (metrics) => ({ ...metrics, ended: true })),
  ).pipe(Effect.asVoid);
