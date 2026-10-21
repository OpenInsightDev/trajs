/**
 * The trajectory a stream of parts and a config make: the config stated on the stream
 * its parts arrive in.
 *
 * A trajectory is its parts together with what they are read with ({@link Trajectory}),
 * so a config is carried by the stream rather than stated beside it.
 *
 * It is stated here rather than in `Trajectory` alone because a module `Trajectory`
 * reads as it loads attaches one too ({@link Event.encode}): a value read at load
 * cannot be handed back to the module that reads it without the two waiting on each
 * other, so the attach both of them state lives in neither.
 *
 * Nothing here is published: a program reaches it through `Trajectory.make`.
 */

import type { AnyConfig, Trajectory, TrajectoryStream } from "#/Trajectory.ts";

/** `config` attached to the stream given, as the trajectory its parts make. */
export const attach =
  <Config extends AnyConfig>(config: Config) =>
  <E, R>(stream: TrajectoryStream<Config, E, R>): Trajectory<Config, E, R> =>
    Object.assign(stream, config);
