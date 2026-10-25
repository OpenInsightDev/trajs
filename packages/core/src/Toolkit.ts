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
 * A draft-07 JSON Schema document for a stored tool schema.
 *
 * @stability stable
 * @category encoding
 */
export type JsonSchemaDocument = JsonSchema.Document<"draft-07">;

/**
 * A tool declaration without its runtime handler.
 *
 * **Details**
 *
 * Parameter, success, and failure schemas use draft-07 JSON Schema documents.
 * An absent description stays absent.
 *
 * @see {@link encode} for serializing a toolkit.
 * @stability stable
 * @category encoding
 */
export type ToolEncoded = Readonly<{
  id: string;
  name: string;
  description?: string;
  parameters: JsonSchemaDocument;
  success: JsonSchemaDocument;
  failure: JsonSchemaDocument;
}>;

/**
 * Stored tool declarations keyed by their toolkit keys.
 *
 * @see {@link ToolEncoded} for each declaration.
 * @stability stable
 * @category encoding
 */
export type ToolkitEncoded = Record<string, ToolEncoded>;

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
 * @see {@link ToolkitEncoded} for the stored representation.
 * @stability stable
 * @category encoding
 */
export const encode = (toolkit: Toolkit.Any): ToolkitEncoded =>
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
