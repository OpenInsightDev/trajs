/**
 * The trajectory a stream of parts, a config and an id make: the config stated on the
 * stream its parts arrive in, and the id the trajectory is named by.
 *
 * A trajectory is its parts together with what they are read with and the id it is named
 * by ({@link Trajectory}), so a config and an id are carried by the stream rather than
 * stated beside it.
 *
 * It is stated here rather than in `Trajectory` alone because a module `Trajectory`
 * reads as it loads attaches one too ({@link Event.encode}): a value read at load
 * cannot be handed back to the module that reads it without the two waiting on each
 * other, so the attach both of them state lives in neither.
 *
 * Nothing here is published: a program reaches it through `Trajectory.make`.
 */

import { v7 as uuidv7 } from "uuid";

import * as Config from "#/Config.ts";
import type { Trajectory, TrajectoryStream } from "#/Trajectory.ts";

/**
 * The id a trajectory made without one is named by: a version 7 uuid, as every part of a
 * trajectory is identified by one.
 */
export const uuid = (): string => uuidv7();

/**
 * `config` attached to the stream given under the id given — or under a new uuid where no
 * id is stated — as the trajectory its parts make.
 */
export const attach =
  <Config extends Config.AnyConfig>(id: string | undefined, config: Config) =>
  <E, R>(stream: TrajectoryStream<Config, E, R>): Trajectory<string, Config, E, R> =>
    Object.assign(stream, config, { id: id ?? uuid() });
