---
"@trajs/core": minor
---

`Trajectory.config` states what a trajectory is read with as a value: the five fields of
`Trajectory.Config` — `stream`, `toolkit`, `eventkit`, `metrickit` and `extrakit` — given
once and handed to every reading of a trajectory.

Each type parameter is read off the field given, so `stream: false` is the literal `false`
rather than `boolean`, and each kit is the kit given rather than any kit. A reading is
therefore typed as `Trajectory.TrajectoryStream<typeof config>` without a field of the
config being stated `as const`, and what a program reads trajectories with is stated where
it is known rather than written out at each call: `Trajectory.anyConfig`, what
`Trajectory.merge` and `Produce` state of a trajectory, the `traj-analysis` examples and
the tests say theirs through it.
