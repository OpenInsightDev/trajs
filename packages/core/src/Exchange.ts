import { Context, type Effect } from "effect";
import type { JsonObject } from "effect/Schema";

import * as Config from "#/Config.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

export interface Inspection {
  id: string;
  version: string;
  toolkit: Record<string, JsonObject>;
  eventkit: Record<string, JsonObject>;
  metrickit: Record<string, JsonObject>;
  extrakit: Record<string, JsonObject>;
  digest: string;
  length: number;
  fileSize: bigint;
}

export interface Exchange {
  read: <Config extends Config.AnyConfig>(
    config: Config,
  ) => (
    id: string,
  ) => Trajectory.TrajectoryFile<string, Config, TrajectoryError, Config.SchemaServices<Config>>;

  write: <Id extends string, Config extends Config.AnyConfig>(
    id: Id,
    stream: Trajectory.TrajectoryStream<Config>,
  ) => Effect.Effect<void, TrajectoryError, Config.SchemaServices<Config>>;

  inspect: (id: string) => Effect.Effect<Inspection, TrajectoryError>;
}

export const Exchange = Context.Service<Exchange, Exchange>("trajs/Exchange");
