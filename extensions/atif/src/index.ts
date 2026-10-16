/**
 * ATIF — the Agent Trajectory Interchange Format — and a `@trajs/core` recording,
 * read as each other.
 *
 * `Document` states the format itself — the document a `trajectory.json` holds and
 * the schemas it is made of — while `Step` reads a `@trajs/core` recording as the
 * steps ATIF exchanges and holds the model those steps are, and `Recording`
 * reads the other way: a document is read as the recording it states. Each is
 * re-exported as a namespace, and each is also available as the subpath import
 * `@trajs/extension-atif/Document`, `@trajs/extension-atif/Step` and
 * `@trajs/extension-atif/Recording`. The events the conventions ATIF states of a run
 * are recorded as are re-exported directly, because they are what the package
 * records a trajectory with. Every module is also available as a subpath import of
 * its own.
 */
export * as Document from "./Document.ts";

export * from "./Events.ts";

export * as Recording from "./Recording.ts";

export * as Step from "./Step.ts";
