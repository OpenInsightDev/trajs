import { ByteStore } from "@trajs/utils";
import { Effect, type Stream } from "effect";

import * as Config from "#/Config.ts";
import * as Trajectory from "#/Trajectory.ts";

import type { TrajectoryError } from "./TrajectoryError.ts";

export type SessionStream<Config extends Config.AnyConfig, E, R> = Stream.Stream<
  Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
  E,
  R
>;

export type Session<Config extends Config.AnyConfig, E, R> = Readonly<{
  id: string;
  forkFrom: Readonly<{
    session: Session<Config, E, R>;
    uuid: string;
  }>;
  forkBy: Record<string, Session<Config, E, R>>;
  stream: SessionStream<Config, E, R>;
}>;

export type MainSession<Config extends Config.AnyConfig, E, R> = Readonly<{
  forkBy: Record<string, Session<Config, E, R>>;
  stream: SessionStream<Config, E, R>;
}>;

export const main = Effect.fn(function* <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.fn.Return<
  MainSession<Config, E, R>,
  TrajectoryError | ByteStore.ByteStoreError,
  ByteStore.ByteStore
> {
  throw new Error("Not implemented");
});
