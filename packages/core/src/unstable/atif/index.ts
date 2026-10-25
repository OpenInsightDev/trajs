/**
 * Agent Trajectory Interchange Format schemas and trajectory conversion views.
 *
 * Document schemas validate recorded runs before importing their supported conversation data.
 * Text-oriented session views expose steps without promising complete document serialization.
 *
 * @stability stable
 */

/**
 * ATIF document, content, observation, and metadata schemas.
 *
 * @stability stable
 * @category re-exports
 */
export * as Document from "#/unstable/atif/Document.ts";

/**
 * ATIF document and JSON-file import into trajectory parts.
 *
 * @stability stable
 * @category re-exports
 */
export * as Encode from "#/unstable/atif/Encode.ts";

/**
 * ATIF context-management event declarations and constructors.
 *
 * @stability stable
 * @category re-exports
 */
export * as Event from "#/unstable/atif/Event.ts";

/**
 * Versioned ATIF run and step extras.
 *
 * @stability stable
 * @category re-exports
 */
export * as Extra from "#/unstable/atif/Extra.ts";

/**
 * Text-oriented ATIF step views over session streams.
 *
 * @stability stable
 * @category re-exports
 */
export * as Step from "#/unstable/atif/Step.ts";
