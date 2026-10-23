import type { ByteStore, ByteStoreError } from "@trajs/utils/ByteStore";
import { type Effect, Option, type Scope, type Stream } from "effect";

import * as Config from "#/Config.ts";
import type * as Extra from "#/Extra.ts";
import type { EncodingServices, Readable } from "#/internal/parts.ts";
import { read, readCached } from "#/internal/sessions.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

export interface Fork {
  readonly session: string;
  readonly part: string;
}

export type SessionStream<Config extends Config.AnyConfig, E = never, R = never> = Stream.Stream<
  Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
  E,
  R
>;

export interface Session<Config extends Config.AnyConfig, E = never, R = never> {
  readonly id: string;
  readonly forkedFrom: Option.Option<Fork>;
  readonly extra: Extra.ExtraRecord<Config["extrakit"]["extra"], "session">;
  readonly stream: SessionStream<Config, E, R>;
  readonly own: SessionStream<Config, E, R>;
  readonly inherited: ReadonlyArray<Inheritance<Config, E, R>>;
}

export interface Inheritance<Config extends Config.AnyConfig, E = never, R = never> {
  readonly session: string;
  readonly stream: SessionStream<Config, E, R>;
}

export type Sessions<Config extends Config.AnyConfig, E = never, R = never> = ReadonlyArray<
  Session<Config, E, R>
>;

export const toSessions = <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R> & Readable<Config>,
): Effect.Effect<
  Sessions<Config, E | TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config>
> => read(trajectory);

export const toSessionsCached = <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R> & Readable<Config>,
  options?: Trajectory.CacheOptions,
): Effect.Effect<
  Sessions<Config, E | TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config> | ByteStore | Scope.Scope
> => readCached(trajectory, options);

export const session =
  (id: string) =>
  <Config extends Config.AnyConfig, E, R>(
    sessions: Sessions<Config, E, R>,
  ): Option.Option<Session<Config, E, R>> =>
    Option.fromUndefinedOr(sessions.find((session) => session.id === id));
