/**
 * Trajectory parts, production, storage, and conversation views.
 *
 * Part builders and schemas share one config across production, storage, and session-oriented reads.
 * The entry point also re-exports shared storage and byte-processing utilities.
 *
 * @stability stable
 */

/**
 * Replayable trajectory caching and backing-store layers.
 *
 * @stability stable
 * @category re-exports
 */
export * as Cache from "#/Cache.ts";

/**
 * Response variants, kit configuration, and schema requirements.
 *
 * @stability stable
 * @category re-exports
 */
export * as Config from "#/Config.ts";

/**
 * Versioned event declarations and tagged payload schemas.
 *
 * @stability stable
 * @category re-exports
 */
export * as Event from "#/Event.ts";

/**
 * Event declaration collections and merge operations.
 *
 * @stability stable
 * @category re-exports
 */
export * as EventKit from "#/EventKit.ts";

/**
 * Stored trajectory inspection, loading, and saving.
 *
 * @stability stable
 * @category re-exports
 */
export * as Exchange from "#/Exchange.ts";

/**
 * The reasons a stored trajectory fails validation.
 *
 * @stability stable
 * @category re-exports
 */
export * as ExchangeIssue from "#/ExchangeIssue.ts";

/**
 * Versioned extras for prompt, response, and session parts.
 *
 * @stability stable
 * @category re-exports
 */
export * as Extra from "#/Extra.ts";

/**
 * Extra declaration collections and merge operations.
 *
 * @stability stable
 * @category re-exports
 */
export * as ExtraKit from "#/ExtraKit.ts";

/**
 * Metric declarations, results, and stream producers.
 *
 * @stability stable
 * @category re-exports
 */
export * as Metric from "#/Metric.ts";

/**
 * Metric collections and producer registration.
 *
 * @stability stable
 * @category re-exports
 */
export * as MetricKit from "#/MetricKit.ts";

/**
 * The fields a `package.json` states about the package itself.
 *
 * @stability stable
 * @category re-exports
 */
export { PackageMetadata } from "#/Package.ts";

/**
 * Live trajectory writers and metric enrichment.
 *
 * @stability stable
 * @category re-exports
 */
export * as Produce from "#/Produce.ts";

/**
 * Effect conversation messages and prompt constructors.
 *
 * @stability stable
 * @category re-exports
 */
export * as Prompt from "#/Prompt.ts";

/**
 * Effect response parts and views accepting undeclared tools.
 *
 * @stability stable
 * @category re-exports
 */
export * as Response from "#/Response.ts";

/**
 * Session discovery, fork trees, and inherited streams.
 *
 * @stability stable
 * @category re-exports
 */
export * as Session from "#/Session.ts";

/**
 * Effect tool declarations, schemas, and handlers.
 *
 * @stability stable
 * @category re-exports
 */
export * as Tool from "#/Tool.ts";

/**
 * Effect toolkits and stored schema descriptions.
 *
 * @stability stable
 * @category re-exports
 */
export * as Toolkit from "#/Toolkit.ts";

/**
 * Configured part schemas, builders, and named trajectory streams.
 *
 * @stability stable
 * @category re-exports
 */
export * as Trajectory from "#/Trajectory.ts";

/**
 * Structured trajectory parsing, tool-schema, and session failures.
 *
 * @stability stable
 * @category re-exports
 */
export * as TrajectoryError from "#/TrajectoryError.ts";

/**
 * Historical decoding and current-version encoding for payload schemas.
 *
 * @stability stable
 * @category re-exports
 */
export * as VersionedSchema from "#/VersionedSchema.ts";

/**
 * Conversation steps, tool turns, and attached metric views.
 *
 * @stability stable
 * @category re-exports
 */
export * as View from "#/view/index.ts";

/**
 * Re-exports shared byte storage, compression, hashing, and utility APIs.
 *
 * @stability stable
 * @category re-exports
 */
export * from "@trajs/utils";
