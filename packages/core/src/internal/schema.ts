import { DateTime, Effect, JsonSchema, Schema } from "effect";
import * as uuid from "uuid";

import type { JsonSchemaDocument } from "#/Toolkit.ts";

export const Uuid = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.withConstructorDefault(Effect.sync(() => uuid.v7())),
);

export const Timestamp = Schema.DateTimeUtcFromString.pipe(
  Schema.withConstructorDefault(DateTime.now),
);

export const documentOf = (schema: Schema.Top): JsonSchemaDocument =>
  JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(schema));
