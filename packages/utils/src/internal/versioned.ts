import { Schema, SchemaGetter } from "effect";

import type { Any, AnyVersioned, VersionedSchema } from "#/VersionedSchema.ts";

export function assemble<
  Self extends Schema.Struct<Schema.Struct.Fields>,
  Members extends ReadonlyArray<Schema.Top>,
>(self: Self, readers: ReadonlyArray<Schema.Top>): VersionedSchema<Self, Members>;
export function assemble(self: Schema.Top, readers: ReadonlyArray<Schema.Top>): Schema.Top {
  return Object.assign(Schema.Union(readers), { self });
}

export const tagSchema = (tag: string, entry: Any): Any => {
  const self = entry.self.mapFields((fields) => ({ ...fields, _tag: Schema.Literal(tag) }));

  // The schema types are explicit, not inferred.
  // A transform from one schema to another names neither schema.
  // Each schema here is the entry's `Any`.
  const writing = Schema.decodeTo<Schema.flip<Any>, Any, never, never>(Schema.flip(entry), {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.forbiddenEncoding,
  })(entry);

  // SAFETY: every version has a version field, so the encoded value is an object.
  // The tag sits on that object beside the other fields.
  const reading = Schema.decodeTo<typeof self, typeof writing, never, never>(self, {
    decode: SchemaGetter.transform((from) => ({
      ...(from as AnyVersioned["Encoded"]),
      _tag: tag,
    })),
    encode: SchemaGetter.forbiddenEncoding,
  })(writing);

  return assemble(self, [self, reading]);
};
