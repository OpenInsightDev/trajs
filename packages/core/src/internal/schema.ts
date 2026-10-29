import { DateTime, Effect, JsonSchema, Schema, SchemaTransformation } from "effect";
import * as uuid from "uuid";

import type { JsonSchemaDocument } from "#/Toolkit.ts";

const bytesOf = (length: number) => Schema.Uint8Array.check(Schema.isBetweenLength(length, length));

export const Uuid = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.withConstructorDefault(Effect.sync(() => uuid.v7())),
);

export const UuidByte = bytesOf(16).pipe(
  Schema.withConstructorDefault(Effect.sync(() => uuid.parse(uuid.v7()))),
);

// Bytes become a string before `Uuid` checks them, so a value that is not a
// uuid v7 fails here too.
export const UuidFromByte = UuidByte.pipe(
  Schema.decodeTo(
    Uuid,
    SchemaTransformation.transform<string, Uint8Array>({
      decode: (bytes) => uuid.stringify(bytes),
      encode: (value) => uuid.parse(value),
    }),
  ),
);

export const Timestamp = Schema.DateTimeUtcFromString.pipe(
  Schema.withConstructorDefault(DateTime.now),
);

export const TimestampEpoch = Schema.DateTimeUtcFromMillis.pipe(
  Schema.withConstructorDefault(DateTime.now),
);

// A chunk's chain, a frontier, and a file's digest are one value: 32 bytes,
// whatever algorithm the header names.
export const Chain = bytesOf(32);

export const documentOf = (schema: Schema.Top): JsonSchemaDocument =>
  JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(schema));
