/**
 * The core package: what a trajectory is and the kits that describe what
 * extensions contribute to one, and the exchange that carries a trajectory as
 * the bytes of a recording.
 *
 * Every module is re-exported as a namespace — `Metric.Metric`,
 * `Trajectory.Part` — and each is also available as a subpath import such as
 * `@trajs/core/Metric`.
 *
 * The exchange carries a recording's parts in a frame, and what writes and reads
 * that frame, what hashes the parts and where a recording is kept are
 * `@trajs/utils`'s services: a program provides `Exchange.layer` with the layers a
 * platform package states them with — `@trajs/platform-node`, over `node:zlib`, the
 * Rust binding and `node:crypto`, or `@trajs/platform-browser`, over WebAssembly
 * codecs that run where `node:zlib` is not, a page say.
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
