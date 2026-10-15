/**
 * The core package: what a trajectory is and the kits that describe what
 * extensions contribute to one, and the exchange that carries a trajectory as
 * the bytes of a recording.
 *
 * Every module is re-exported as a namespace — `Metric.Metric`,
 * `Trajectory.Part` — and each is also available as a subpath import such as
 * `@trajs/core/Metric`.
 *
 * `Zstd` is the one module that is a subpath alone: it is the `node:zlib`
 * compression the exchange is built over, so what this entry point holds stays
 * free of `node:zlib` and the model is importable where `node:zlib` is not — a
 * page, for instance, which builds {@link Exchange.layer} over a compression of
 * its own. A program that runs on Node imports it as `@trajs/core/Zstd`.
 */

export * as Event from "#/Event.ts";

export * as Exchange from "#/Exchange.ts";

export * as Extra from "#/Extra.ts";

export * as Metric from "#/Metric.ts";

export * as Produce from "#/Produce.ts";

export * as Prompt from "#/Prompt.ts";

export * as Response from "#/Response.ts";

export * as Session from "#/Session.ts";

export * as Tool from "#/Tool.ts";

export * as Toolkit from "#/Toolkit.ts";

export * as Trajectory from "#/Trajectory.ts";

export * as TrajectoryError from "#/TrajectoryError.ts";

export * as VersionedSchema from "#/VersionedSchema.ts";

export * as View from "#/View.ts";
