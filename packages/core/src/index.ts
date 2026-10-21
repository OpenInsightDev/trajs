/**
 * The core package: what a trajectory is, the kits that describe what extensions
 * contribute to one, and the {@link Exchange} that carries a trajectory as bytes —
 * beside the services a trajectory is carried through, which `@trajs/utils` states
 * and this package re-exports, so that a program reads a trajectory and provides what
 * reads it from `@trajs/core` alone.
 *
 * Every module is re-exported as a namespace — `Metric.Metric`,
 * `Storage.layerFileSystem` — and each of this package's own modules is also
 * available as a subpath import such as `@trajs/core/Metric`.
 */

export * as Event from "#/Event.ts";

export * as EventKit from "#/EventKit.ts";

export * as Exchange from "#/Exchange.ts";

export * as Extra from "#/Extra.ts";

export * as ExtraKit from "#/ExtraKit.ts";

export * as Metric from "#/Metric.ts";

export * as MetricKit from "#/MetricKit.ts";

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

// The services a trajectory is carried through, which `@trajs/utils` states: re-exported
// so that a program reads and writes a trajectory through `@trajs/core` alone.
export * from "@trajs/utils";
