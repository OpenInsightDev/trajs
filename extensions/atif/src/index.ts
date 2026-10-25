/**
 * ATIF — the Agent Trajectory Interchange Format — and a `@trajs/core` trajectory,
 * read as each other.
 *
 * `Document` states the format, `Step` reads a trajectory as the steps ATIF
 * exchanges, and `Encode` reads a document as a trajectory. The events the conventions
 * ATIF states are produced as are re-exported directly.
 */
export * as Document from "./Document.ts";

export * from "./Extras.ts";

export * from "./Events.ts";

export * as Encode from "./Encode.ts";

export * as Step from "./Step.ts";
