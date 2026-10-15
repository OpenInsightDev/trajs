/**
 * The core package: what a trajectory is and the kits that describe what
 * extensions contribute to one, and the exchange that carries a trajectory as
 * the bytes of a recording.
 *
 * Every module is re-exported as a namespace — `Metric.Metric`,
 * `Trajectory.Part` — and each is also available as a subpath import such as
 * `@trajs/core/Metric`.
 *
 * The exchange carries a recording's parts in a zstd frame, and what writes and
 * reads that frame is a compression the layer is built over: `Exchange.nodeLayer`
 * is over `node:zlib`, which only a program that runs on Node loads, and
 * `Exchange.wasmLayer` is over a WebAssembly codec that runs anywhere — the payload
 * is loaded when it first writes or reads a frame.
 */

export * as Event from "#/Event.ts";

export * as Exchange from "#/Exchange.ts";

export * as Extra from "#/Extra.ts";

export * as Indexing from "#/Indexing.ts";

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
