import { Effect, JsonSchema, Schema } from "effect";
import { Tool, type Toolkit } from "effect/ai";
import { type Trajectory } from "#/Trajectory.ts";

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
        parameters: JsonSchema.toDocumentDraft07(
          JsonSchema.fromSchemaDraft2020_12(Tool.getJsonSchema(tool)),
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

export const toolkits = <Toolkits extends ReadonlyArray<Toolkit.Any>>(...toolkits: Toolkits) =>
  Effect.fn(function* <Tools extends Record<string, Tool.Any>>(trajectory: Trajectory<Tools>) {});
