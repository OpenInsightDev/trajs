/**
 * ATIF — the Agent Trajectory Interchange Format — read from a recording.
 *
 * `Step` reads a `@trajs/core` recording as the steps ATIF exchanges and holds
 * the model those steps are; it is re-exported as a namespace, and is also
 * available as the subpath import `@trajs/extension-atif/Step`. The events the
 * conventions ATIF states of a run are recorded as are re-exported directly,
 * because they are what the package records a trajectory with. Every module is
 * also available as a subpath import of its own.
 */
export * from "./Events.ts";

export * as Step from "./Step.ts";
