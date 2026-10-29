/**
 * The stored form of a schema.
 *
 * {@link SchemaDocument} states a schema as a `SchemaRepresentation` document in its JSON form.
 * Every stored kit declaration holds the schemas it names as one of them.
 *
 * @stability stable
 */

import { Schema } from "effect";

/**
 * Schema for a stored schema.
 *
 * **Details**
 *
 * A stored schema is a `SchemaRepresentation.Document` in its JSON form.
 * `SchemaRepresentation.fromJson` reads it, and `SchemaRepresentation.fromRepresentation` rebuilds the schema.
 *
 * **Gotchas**
 *
 * Effect states no schema for a representation document, so this schema accepts any JSON value.
 * Rebuilding a document needs a reviver for every declaration and every check it names.
 *
 * @stability stable
 * @category schemas
 */
export const SchemaDocument = Schema.Json;

/**
 * A stored schema.
 *
 * @see {@link SchemaDocument} for the schema.
 * @stability stable
 * @category models
 */
export type SchemaDocument = Schema.Schema.Type<typeof SchemaDocument>;
