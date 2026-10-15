import { Schema, SchemaGetter } from "effect";

import type { Metadata } from "#/Extension.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/**
 * One step of an extension's upgrade: the fields a schema has at its version next,
 * and how a datum of the version before reads into them.
 *
 * Which schema a step moves is not in hand where it is written, since `upgrade` is
 * given its steps before the extension it moves: `Prev` is that schema where the
 * caller names one, and the version before is otherwise read as versioned data.
 */
export type Step<
  More extends Schema.Struct.Fields & { readonly version: VersionedSchema.AnyVersion },
  Prev = undefined,
> = {
  readonly fields: (
    previous: Prev extends VersionedSchema.Any ? Prev["self"]["fields"] : Schema.Struct.Fields,
  ) => More;
  readonly change: {
    readonly decode: (
      from: Prev extends VersionedSchema.Any ? Prev["Type"] : VersionedSchema.AnyVersioned["Type"],
    ) => Schema.Struct<More>["Encoded"];
  };
};

/**
 * A schema as an upgrade leaves it: `Prev` moved on by `More`, and `Unmoved` — the
 * schema as it is, unless the caller names another — where no step is given for it.
 */
export type Moved<
  Prev,
  More extends Schema.Struct.Fields & { readonly version: VersionedSchema.AnyVersion } = never,
  Unmoved = Prev,
> = [More] extends [never]
  ? Unmoved
  : Prev extends VersionedSchema.Any
    ? VersionedSchema.Upgraded<Prev, More>
    : Unmoved;

/** A step as the signature implementing an upgrade reads it: the overload that takes a step is what gives it its types. */
type AnyStep = Step<any, any>;

/**
 * The steps an extension's upgrade is given, one per schema it moves: the schemas an
 * extension carries beside its derivation under their own names, the two schemas of
 * a derivation as the pair they are declared as, and how the extension describes
 * itself.
 */
export type GivenSteps = {
  readonly part?: AnyStep;
  readonly system?: AnyStep;
  readonly derived?: {
    readonly output?: AnyStep;
    readonly failure?: AnyStep;
  };
  readonly metadata?: (previous: Metadata) => Metadata;
};

/** Moves one schema of a config to its next version, leaving `previous` as it is when no step is given for it. */
export const moveSchema = (
  previous: VersionedSchema.Any,
  { fields, change }: AnyStep,
): VersionedSchema.Any =>
  VersionedSchema.upgrade(fields, { decode: SchemaGetter.transform(change.decode) })(previous);
