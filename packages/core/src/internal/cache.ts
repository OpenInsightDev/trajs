import type { ByteStore } from "@trajs/utils";
import { Effect, Scope } from "effect";

import type * as Config from "#/Config.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

export const cached = Effect.fn(function* <
  Id extends string,
  Config extends Config.AnyConfig,
  E,
  R,
>(
  trajectory: Trajectory.Trajectory<Id, Config, E, R>,
  options?: Trajectory.CacheOptions,
): Effect.fn.Return<
  Trajectory.Trajectory<Id, Config, E | TrajectoryError | ByteStore.ByteStoreError, never>,
  E | TrajectoryError | ByteStore.ByteStoreError,
  Scope.Scope | R | ByteStore.ByteStore
> {
  throw new Error("Not implemented yet");
});
