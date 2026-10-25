/**
 * OpenTelemetry GenAI semantic conventions as Effect schemas.
 *
 * `Attributes` states the value model and the open enumerations of the registry.
 * `Content` states the message, tool, retrieval, and memory payloads the attributes
 * carry. `Spans`, `Metrics`, and `Events` state the signals of the GenAI and MCP
 * conventions, and `Entities` the main agent entity. `SemanticConventions` states
 * the versions and schema URLs the module was read from.
 *
 * @see [the published conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).
 * @stability experimental
 */

/**
 * Attribute values, attribute maps, prompt variables, and open enumerations.
 *
 * @stability experimental
 * @category re-exports
 */
export * as Attributes from "#/unstable/otel/Attributes.ts";

/**
 * Message, tool, retrieval, and memory payload schemas.
 *
 * @stability experimental
 * @category re-exports
 */
export * as Content from "#/unstable/otel/Content.ts";

/**
 * GenAI entity definitions.
 *
 * @stability experimental
 * @category re-exports
 */
export * as Entities from "#/unstable/otel/Entities.ts";

/**
 * GenAI event definitions.
 *
 * @stability experimental
 * @category re-exports
 */
export * as Events from "#/unstable/otel/Events.ts";

/**
 * GenAI and MCP metric definitions.
 *
 * @stability experimental
 * @category re-exports
 */
export * as Metrics from "#/unstable/otel/Metrics.ts";

/**
 * Registry versions and schema URLs.
 *
 * @stability experimental
 * @category re-exports
 */
export * as SemanticConventions from "#/unstable/otel/SemanticConventions.ts";

/**
 * GenAI and MCP span definitions.
 *
 * @stability experimental
 * @category re-exports
 */
export * as Spans from "#/unstable/otel/Spans.ts";
