/**
 * ATIF — the Agent Trajectory Interchange Format — and a `@trajs/core` trajectory,
 * read as each other.
 *
 * `Document` states the format, `Step` reads a trajectory as the steps ATIF
 * exchanges, and `Encode` reads a document as a trajectory. `Event` and `Extra`
 * declare what the format states of a convention and of the data a part carries.
 */
export * as Document from "#/atif/Document.ts";

export * as Encode from "#/atif/Encode.ts";

export * as Event from "#/atif/Event.ts";

export * as Extra from "#/atif/Extra.ts";

export * as Step from "#/atif/Step.ts";
