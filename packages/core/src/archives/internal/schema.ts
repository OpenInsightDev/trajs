import { DateTime, Effect, Schema } from "effect";
import * as uuid from "uuid";

export const Uuid = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.withConstructorDefault(Effect.sync(() => uuid.v7())),
);

export const Timestamp = Schema.DateTimeUtcFromString.pipe(
  Schema.withConstructorDefault(DateTime.now),
);
