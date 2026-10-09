/**
 * Builds the Schema of the extension parts an extension kit describes.
 *
 * Extension data is carried by the `Extension` part of a trajectory. A part is
 * built per extension of the kit, discriminated by the identifier the data was
 * recorded for, so the data of each extension is validated by its own line of
 * versions and read as its newest one.
 */

import { Schema } from "effect";
import type * as Extensionkit from "#/Extensionkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { Timestamp, Uuid } from "#/internal/schema.ts";

/**
 * One member of an extension kit: the extension it belongs to, and its data.
 *
 * The identifier is recorded as a literal rather than as a string, so the data
 * of each extension is discriminated by the extension it came from, the way a
 * tool call is discriminated by the name of its tool.
 */
const extensionPart = <Id extends string, V extends Schema.Top>(id: Id, version: V) =>
  Schema.TaggedStruct("Extension", {
    extension: Schema.Literal(id),
    data: version,
    timestamp: Timestamp,
    attach: Schema.OptionFromOptionalKey(Schema.NonEmptyArray(Uuid)),
    ...Trajectory.PartMetadata.fields,
  });

/**
 * The parts an extension kit describes: one member per extension of the kit,
 * keyed by the identifier the data was recorded for.
 *
 * The walk is what loses the kit's identifiers and schemas, so this is what the
 * members are declared to be rather than what the walk can write down.
 */
type ExtensionParts<Exts extends Extensionkit.Any> = {
  readonly [Id in keyof Exts]: ReturnType<typeof extensionPart<Id & string, Exts[Id]>>;
}[keyof Exts];

/** The parts an extension kit describes: one per extension of the kit. */
export const extensionParts = <Exts extends Extensionkit.Any>(
  extkit: Exts,
): Schema.Codec<
  Schema.Schema.Type<ExtensionParts<Exts>>,
  Schema.Codec.Encoded<ExtensionParts<Exts>>,
  never,
  never
> =>
  // SAFETY: each member is built from the entry it came from, so the members are
  // the kit's own schemas; the walk is what loses their types, not the union.
  Schema.Union(Object.entries(extkit).map(([id, version]) => extensionPart(id, version))) as any;
