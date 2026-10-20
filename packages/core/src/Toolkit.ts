/**
 * A toolkit as a trajectory's header describes it: {@link encode} writes a toolkit as
 * the JSON objects of {@link ToolkitEncoded}, so a trajectory names the tools its
 * responses refer to without their Effect Schemas. The rest of `effect/ai/Toolkit`
 * is re-exported.
 *
 * A trajectory read as the calls it made with those tools is {@link View.toolTurns}.
 */

import { JsonSchema, pipe, Schema } from "effect";
import { Tool, type Toolkit } from "effect/ai";

export * from "effect/ai/Toolkit";

/** A tool schema as a JSON Schema draft-07 document. */
export type JsonSchemaDocument = JsonSchema.Document<"draft-07">;

/** One tool as a trajectory's header describes it. */
export type ToolEncoded = Readonly<{
  id: string;
  name: string;
  description?: string;
  parameters: JsonSchemaDocument;
  success: JsonSchemaDocument;
  failure: JsonSchemaDocument;
}>;

/** A toolkit as a trajectory's header describes it, keyed by the key each tool is held at. */
export type ToolkitEncoded = Record<string, ToolEncoded>;

/** Encodes a toolkit as the descriptions a trajectory's header carries. */
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

/** The type of {@link empty}: a toolkit that holds no tool. */
export type Empty = typeof Toolkit.empty;
