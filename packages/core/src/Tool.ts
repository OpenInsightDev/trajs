/**
 * Tool declarations, their stored form, and Effect's tool APIs.
 *
 * {@link ToolSchema} states a tool declaration as a header holds it, and {@link encode} stores one.
 * The remaining exports retain the contracts of `effect/ai/Tool`.
 *
 * @stability stable
 */

import { JsonSchema, pipe, Schema, SchemaRepresentation } from "effect";
import { Tool } from "effect/ai";

import { documentOf } from "#/internal/schema.ts";

/**
 * Re-exports Effect's tool APIs without modification.
 *
 * @stability stable
 * @category re-exports
 */
export * from "effect/ai/Tool";

/**
 * Schema for a tool declaration without its runtime handler.
 *
 * **Details**
 *
 * Parameter, success, and failure schemas are stored as JSON, as `Schema.Json` accepts.
 * An absent description stays absent.
 *
 * @see {@link encode} for storing a declaration.
 * @stability stable
 * @category schemas
 */
export const ToolSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  parameters: Schema.Json,
  success: Schema.Json,
  failure: Schema.Json,
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
 * Converts a tool declaration into its stored form.
 *
 * **When to use**
 *
 * Use to describe a tool without serializing its handler.
 *
 * **Details**
 *
 * Parameter, success, and failure schemas become JSON, as `Schema.Json` accepts.
 *
 * **Gotchas**
 *
 * Building a document can throw for a schema it cannot state.
 * The result states the encoded side, not the decoding transformations.
 * A dynamic tool states its parameters as JSON Schema, which is what its document is read from.
 *
 * @see {@link ToolSchema} for the stored form.
 * @stability stable
 * @category encoding
 */
export const encode = (tool: Tool.Any): ToolSchema => ({
  id: tool.id,
  name: tool.name,
  description: tool.description,
  parameters: parametersOf(tool),
  success: documentOf(tool.successSchema),
  failure: documentOf(tool.failureSchema),
});

const parametersOf = (tool: Tool.Any): Schema.Json =>
  Tool.isDynamic(tool) && tool.jsonSchema !== undefined
    ? pipe(
        JsonSchema.fromSchemaDraft2020_12(tool.jsonSchema),
        SchemaRepresentation.fromJsonSchemaDocument,
        documentOf,
      )
    : documentOf(tool.parametersSchema);
