import { DateTime, Effect, Schema, SchemaRepresentation, SchemaTransformation } from "effect";
import { SchemaBinary } from "effect/encoding";
import * as uuid from "uuid";

import { TrajectoryError } from "#/TrajectoryError.ts";

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

export const TimestampString = Schema.DateTimeUtcFromString.pipe(
  Schema.withConstructorDefault(DateTime.now),
);

export const TimestampInt = Schema.DateTimeUtcFromMillis.pipe(
  Schema.withConstructorDefault(DateTime.now),
);

// A chunk's chain, a frontier, and a file's digest are one value: 32 bytes,
// whatever algorithm the header names.
export const Chain = bytesOf(32);

export const documentOf = (schema: Schema.Top): Schema.Json =>
  schema.pipe(Schema.toRepresentation, SchemaRepresentation.toJson);

// Every part is written as binary frames, so a schema `SchemaBinary` cannot lay out
// states no part.
export const checkBinaryLayout = (
  schema: Schema.Constraint,
): Effect.Effect<void, TrajectoryError> =>
  Effect.try({
    try: () => SchemaBinary.toCodec(schema),
    catch: TrajectoryError.binaryLayout,
  }).pipe(Effect.asVoid);

// A declaration is a value, so the check runs where the declaration is made rather
// than where a part first writes one.
export const requireBinaryLayout = (schema: Schema.Constraint): void => {
  checkBinaryLayout(schema).pipe(Effect.runSync);
};
