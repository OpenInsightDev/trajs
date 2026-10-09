import { DateTime, Effect, Schema } from "effect";
import * as uuid from "uuid";

/**
 * Identifier schema for trajectory parts.
 *
 * A UUID v7 is generated for each part, so identifiers are unique and sort by
 * creation time.
 */
export const Uuid = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.withConstructorDefault(Effect.sync(() => uuid.v7())),
);

/**
 * Timestamp schema for trajectory parts.
 *
 * The current time is recorded for each part and encoded as an ISO 8601 string.
 */
export const Timestamp = Schema.DateTimeUtcFromString.pipe(
  Schema.withConstructorDefault(DateTime.now),
);

/**
 * Schema for a name in reverse domain notation, such as `dev.observerw.trajs`.
 *
 * Each dot-separated label is checked as a DNS label: letters, digits and
 * hyphens, at most 63 characters, and neither starting nor ending with a hyphen.
 * At least two labels are required, because a reverse domain names a reversed
 * domain rather than a bare word, so `trajs` is rejected and `dev.trajs` is not.
 * Letters may be upper or lower case, as domain names are.
 *
 * Only the notation is checked: the name is not resolved, and no limit is placed
 * on the length of the whole name.
 */
export const ReverseDomain = Schema.String.check(
  Schema.isPattern(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
    { expected: "a reverse domain name" },
  ),
);
