import { JsonSchema, pipe, Schema } from "effect";
import { Tool, type Toolkit } from "effect/ai";

export * from "effect/ai/Toolkit";

export type JsonSchemaDocument = JsonSchema.Document<"draft-07">;

export type ToolEncoded = Readonly<{
  id: string;
  name: string;
  description?: string;
  parameters: JsonSchemaDocument;
  success: JsonSchemaDocument;
  failure: JsonSchemaDocument;
}>;

export type ToolkitEncoded = Record<string, ToolEncoded>;

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

export type Empty = typeof Toolkit.empty;
