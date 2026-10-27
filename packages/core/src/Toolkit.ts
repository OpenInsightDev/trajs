/**
 * Effect toolkits and their schema descriptions for storage.
 *
 * {@link encode} writes tool declarations without handlers.
 * The remaining toolkit APIs come from `effect/ai/Toolkit`.
 *
 * @stability stable
 */

import { JsonSchema, pipe, Schema } from "effect";
import { Tool, type Toolkit } from "effect/ai";

/**
 * Re-exports Effect's toolkit APIs without modification.
 *
 * @stability stable
 * @category re-exports
 */
export * from "effect/ai/Toolkit";

/**
 * Schema for a draft-07 JSON Schema document of a stored schema.
 *
 * **Details**
 *
 * A document states the dialect it is written in, its root schema, and the named definitions
 * the root refers to.
 *
 * @stability stable
 * @category schemas
 */
export const JsonSchemaDocument = Schema.Struct({
  dialect: Schema.Literal("draft-07"),
  schema: Schema.Record(Schema.String, Schema.Unknown),
  definitions: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
});

/**
 * A draft-07 JSON Schema document for a stored schema.
 *
 * @see {@link JsonSchemaDocument} for the schema.
 * @stability stable
 * @category models
 */
export type JsonSchemaDocument = Schema.Schema.Type<typeof JsonSchemaDocument>;

/**
 * Schema for a tool declaration without its runtime handler.
 *
 * **Details**
 *
 * Parameter, success, and failure schemas are draft-07 JSON Schema documents.
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
  parameters: JsonSchemaDocument,
  success: JsonSchemaDocument,
  failure: JsonSchemaDocument,
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
 * Parameter, success, and failure schemas become draft-07 JSON Schema documents.
 *
 * **Gotchas**
 *
 * Schema conversion can throw for unsupported schemas.
 * The result does not preserve schema transformations or runtime services.
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
        // `Tool.getJsonSchema` states the schema as `unknown`, so it is read into
        // a document through `pipe` rather than a `.pipe(...)` of its own.
        parameters: pipe(
          Tool.getJsonSchema(tool),
          JsonSchema.fromSchemaDraft2020_12,
          JsonSchema.toDocumentDraft07,
        ),
        success: JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(tool.successSchema)),
        failure: JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(tool.failureSchema)),
      };

      return [
        key,
        tool.description === undefined ? encoded : { ...encoded, description: tool.description },
      ];
    }),
  );

/**
 * The toolkit type with no declared tools.
 *
 * @see {@link Toolkit.empty} for the value.
 * @stability stable
 * @category utility types
 */
export type Empty = typeof Toolkit.empty;
