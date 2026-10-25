/**
 * Versions and schema URLs of the semantic conventions the module models.
 *
 * `SchemaUrl` is the URL of the development registry the module was read from, and
 * `UpstreamSchemaUrl` the URL of the stable registry it depends on.
 *
 * @see [the source registry](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/model).
 * @stability experimental
 */

/**
 * The version of the GenAI registry the module models.
 *
 * @stability experimental
 * @category constants
 */
export const SchemaVersion = "1.42.0-dev" as const;

/**
 * The schema URL of the GenAI registry the module models.
 *
 * @stability experimental
 * @category constants
 */
export const SchemaUrl = "https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev" as const;

/**
 * The schema URL of the upstream semantic conventions the registry depends on.
 *
 * @stability experimental
 * @category constants
 */
export const UpstreamSchemaUrl = "https://opentelemetry.io/schemas/1.44.0" as const;
