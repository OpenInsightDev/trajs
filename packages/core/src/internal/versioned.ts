/**
 * The assembling behind {@link VersionedSchema}: a shape's versions read as one,
 * with the version next carried beside them, and the tag of a key stated on every
 * version of the shape that key names.
 *
 * Nothing here is published: a program reaches it through `VersionedSchema.make`,
 * `upgrade` and `TaggedUnion`.
 */

import { Schema, SchemaGetter } from "effect";

import type { Any, AnyVersioned, VersionedSchema } from "#/VersionedSchema.ts";

/** A codec that takes no service of its own: what a shape a trajectory holds is made of. */
export type ServiceFree = Schema.Codec<unknown, unknown, never, never>;

/** The fields a shape states, as a trajectory holds them: the services of none at each. */
export type ServiceFreeFields = Readonly<Record<PropertyKey, ServiceFree>>;

export function assemble<
  Self extends Schema.Struct<ServiceFreeFields>,
  Members extends ReadonlyArray<ServiceFree>,
>(self: Self, readers: ReadonlyArray<ServiceFree>): VersionedSchema<Self, Members>;
export function assemble(self: Schema.Top, readers: ReadonlyArray<Schema.Top>): Schema.Top {
  return Object.assign(Schema.Union(readers), { self });
}

/**
 * One tag's shape as a versioned schema: the tag of its key stated on every version
 * of it, so the data of a version before is read as the tag it was written under.
 */
export const tagSchema = (tag: string, entry: Any): Any => {
  const self = entry.self.mapFields((fields) => ({ ...fields, _tag: Schema.Literal(tag) }));

  // The shapes are stated rather than inferred: a transformation that reads one shape as
  // another names neither of them, and every shape here is the `Any` the entry is — one a
  // trajectory holds, which states the services of none.
  const writing = Schema.decodeTo<Schema.flip<Any>, Any, never, never>(Schema.flip(entry), {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.forbiddenEncoding,
  })(entry);

  // SAFETY: every version states its version, so what a version is written as is an
  // object the tag is stated beside rather than a value of no fields.
  const reading = Schema.decodeTo<typeof self, typeof writing, never, never>(self, {
    decode: SchemaGetter.transform((from) => ({
      ...(from as AnyVersioned["Encoded"]),
      _tag: tag,
    })),
    encode: SchemaGetter.forbiddenEncoding,
  })(writing);

  return assemble(self, [self, reading]);
};
