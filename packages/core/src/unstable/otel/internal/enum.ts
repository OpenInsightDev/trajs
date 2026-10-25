import { Schema } from "effect";

/**
 * Schema for an open enumeration.
 *
 * The values the registry lists are stated for producers and for generated
 * documentation. A decoder accepts any other string, since every enumerated
 * attribute in the registry lets instrumentation report a provider-specific
 * value in place of the listed ones.
 */
export const openEnum = <const Values extends ReadonlyArray<string>>(values: Values) =>
  Schema.Union([Schema.Literals(values), Schema.String]);
