import { v7 as uuidv7 } from "uuid";

import type * as Config from "#/Config.ts";
import type { Trajectory, TrajectoryStream } from "#/Trajectory.ts";

export const uuid = (): string => uuidv7();

export const attach =
  <Id extends string, Config extends Config.AnyConfig>(id: Id, config: Config) =>
  <E, R>(stream: TrajectoryStream<Config, E, R>): Trajectory<Id, Config, E, R> =>
    Object.assign(stream, config, { id });

export const configOf = <Config extends Config.AnyConfig>(trajectory: Readonly<Config>): Config =>
  // SAFETY: these fields are the config. The trajectory carries that config.
  ({
    toolkit: trajectory.toolkit,
    eventkit: trajectory.eventkit,
    metrickit: trajectory.metrickit,
    extrakit: trajectory.extrakit,
  }) as Config;
