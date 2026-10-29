/**
 * Effect toolkits and their schema descriptions for storage.
 *
 * {@link encode} writes tool declarations without handlers.
 * The remaining toolkit APIs come from `effect/ai/Toolkit`.
 *
 * @stability stable
 */

import { JsonSchema, pipe, Schema, SchemaRepresentation } from "effect";
import { Tool, type Toolkit } from "effect/ai";

import { documentOf } from "#/internal/schema.ts";

/**
 * Re-exports Effect's toolkit APIs without modification.
 *
 * @stability stable
 * @category re-exports
 */
export * from "effect/ai/Toolkit";

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

/**
 * Schema for a tool declaration without its runtime handler.
 *
 * **Details**
 *
 * Parameter, success, and failure schemas are stored as {@link SchemaDocument}s.
 * An absent description stays absent.
 *
 * @see {@link encode} for serializing a toolkit.
 * @stability stable
 * @category schemas
 */
export const ToolSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  parameters: SchemaDocument,
  success: SchemaDocument,
  failure: SchemaDocument,
});

/**
 * A tool declaration without its runtime handler.
 *
 * @see {@link ToolSchema} for the schema.
 * @stability stable
 * @category models
 */
export type ToolSchema = Schema.Schema.Type<typeof ToolSchema>;

/**
 * Schema for stored tool declarations keyed by their toolkit keys.
 *
 * @see {@link ToolSchema} for each declaration.
 * @stability stable
 * @category schemas
 */
export const ToolkitSchema = Schema.Record(Schema.String, ToolSchema);

/**
 * Stored tool declarations keyed by their toolkit keys.
 *
 * @see {@link ToolkitSchema} for the schema.
 * @stability stable
 * @category models
 */
export type ToolkitSchema = Schema.Schema.Type<typeof ToolkitSchema>;

/**
 * Converts a toolkit into stored tool declarations.
 *
 * **When to use**
 *
 * Use to describe tools without serializing their handlers.
 *
 * **Details**
 *
 * Record keys stay unchanged.
 * Parameter, success, and failure schemas become {@link SchemaDocument}s.
 *
 * **Gotchas**
 *
 * Building a document can throw for a schema it cannot state.
 * The result states the encoded side, not the decoding transformations.
 * A dynamic tool states its parameters as JSON Schema, which is what its document is read from.
 *
 * @see {@link ToolkitSchema} for the stored representation.
 * @stability stable
 * @category encoding
 */
export const encode = (toolkit: Toolkit.Any): ToolkitSchema =>
  Object.fromEntries(
    Object.entries(toolkit.tools).map(([key, tool]) => {
      const encoded = {
        id: tool.id,
        name: tool.name,
        parameters: parametersOf(tool),
        success: documentOf(tool.successSchema),
        failure: documentOf(tool.failureSchema),
      };

      return [
        key,
        tool.description === undefined ? encoded : { ...encoded, description: tool.description },
      ];
    }),
  );

const parametersOf = (tool: Tool.Any): SchemaDocument =>
  Tool.isDynamic(tool) && tool.jsonSchema !== undefined
    ? pipe(
        JsonSchema.fromSchemaDraft2020_12(tool.jsonSchema),
        SchemaRepresentation.fromJsonSchemaDocument,
        documentOf,
      )
    : documentOf(tool.parametersSchema);

/**
 * The toolkit type with no declared tools.
 *
 * @see {@link Toolkit.empty} for the value.
 * @stability stable
 * @category utility types
 */
export type Empty = typeof Toolkit.empty;
