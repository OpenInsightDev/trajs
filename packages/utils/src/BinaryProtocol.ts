/**
 * The bytes of one message of a binary protocol.
 *
 * A message is read one field at a time, in the order the fields are declared,
 * and each field states the bytes it spans. A field states its length, its
 * count, or its branch by the raw value an earlier field read, so one message
 * describes a protocol whose layout the bytes carry.
 *
 * {@link message} states a whole message and {@link struct} a message nested in
 * another. The numbers are {@link u8} through {@link f64}, the byte regions
 * {@link bytes} and {@link bytesOf}, and the repetitions {@link repeat} and
 * {@link repeatOf}. {@link branch} reads one of several layouts by a code an
 * earlier field read.
 *
 * A field reads its bytes into a raw value, and the schema of the field states
 * what that raw holds. {@link as} states that schema, so the values a message
 * holds are checked, branded, and converted by Effect schemas.
 *
 * {@link frame} reads a value any schema states, as `SchemaBinary` lays it out.
 *
 * **Gotchas**
 *
 * A field spans whole bytes. The bits of one byte are not stated apart, so a
 * code split across flags is read as the byte it is, and {@link as} names the
 * value it holds.
 *
 * @stability experimental
 */

import { type Pipeable, Schema, SchemaGetter } from "effect";
import { SchemaBinary } from "effect/encoding";

import {
  BigNumbers,
  branchField,
  FieldCodec,
  frameField,
  nestField,
  Numbers,
  numberField,
  readMessage,
  regionField,
  repeatField,
  stated,
  statedBy,
  writeMessage,
} from "#/internal/binary-protocol.ts";
import type { Raw, Read, Write } from "#/internal/binary-protocol.ts";

/**
 * The order the numbers of one message are read and written in.
 *
 * **Details**
 *
 * `"le"` reads the least significant byte first, and `"be"` the most
 * significant. Floats and numbers of 64 bits take the same order as the rest.
 *
 * @stability experimental
 * @category models
 */
export type Endianness = "le" | "be";

/**
 * The options one message is read and written with.
 *
 * **When to use**
 *
 * Use as the second argument of {@link message}.
 *
 * **Details**
 *
 * - `endianness` is the order of every number of the message, and defaults to
 *   `"le"`.
 *
 * A nested message ({@link struct}) takes the order of the message it is read
 * in, so the order is stated once for a whole message.
 *
 * @see {@link message} for the message these are given to.
 * @stability experimental
 * @category models
 */
export interface Options {
  readonly endianness?: Endianness;
}

/**
 * The bytes a field spans, and the schema of the value they hold.
 *
 * **When to use**
 *
 * Use as the type of a field, such as what {@link u32} or {@link bytesOf}
 * returns, or to type the fields of a message in a signature.
 *
 * **Details**
 *
 * A field is declared before the message it belongs to, so it states no byte
 * order and no position of its own. {@link message} reads the fields in the
 * order they are given.
 *
 * `schema` is the schema of the value. The bytes are read and written by the
 * field itself, so a field is not an Effect schema and is not read by
 * `Schema.decode`. Use {@link message} to obtain the schema of a whole message.
 *
 * @see {@link as} to state the value of a field.
 * @stability experimental
 * @category models
 */
export interface Field<out A = unknown> extends Pipeable.Pipeable {
  readonly schema: Schema.Codec<A, Raw>;

  /** The read of the bytes this field spans, which {@link message} runs. */
  readonly read: Read;

  /** The write of the bytes this field spans, which {@link message} runs. */
  readonly write: Write;
}

/**
 * The values a message of the fields given holds.
 *
 * **Details**
 *
 * A field stated by {@link as} holds the value that schema names.
 *
 * @stability experimental
 * @category models
 */
export type Value<Fields extends Record<string, Field<unknown>>> = {
  readonly [Name in keyof Fields]: Schema.Schema.Type<Fields[Name]["schema"]>;
};

/**
 * The values the cases of a branch hold, as one union.
 *
 * @see {@link branch} for the field these are the cases of.
 * @stability experimental
 * @category models
 */
export type CaseValue<Cases extends Record<string, Field<unknown>>> = {
  readonly [Name in keyof Cases]: Schema.Schema.Type<Cases[Name]["schema"]>;
}[keyof Cases];

const endiannessOf = (options?: Options): Endianness => options?.endianness ?? "le";

const schemasOf = (fields: Readonly<Record<string, Field<unknown>>>) => {
  const schemas: Record<string, Schema.Codec<unknown, Raw>> = {};

  for (const [name, field] of Object.entries(fields)) {
    schemas[name] = field.schema;
  }

  return schemas;
};

const schemaOf = <Fields extends Record<string, Field<unknown>>>(
  fields: Fields,
): Schema.Codec<Value<Fields>, Raw> => {
  const struct: Schema.Top = Schema.Struct(schemasOf(fields));

  // SAFETY: each field's schema states the value of that field, which `Value`
  // reads off the same fields.
  return struct as Schema.Codec<Value<Fields>, Raw>;
};

const casesOf = (
  cases: Readonly<Record<string, Field<unknown>>>,
): Array<Schema.Codec<unknown, Raw>> => {
  const schemas: Array<Schema.Codec<unknown, Raw>> = [];

  for (const field of Object.values(cases)) {
    schemas.push(field.schema);
  }

  return schemas;
};

const unionOf = <Cases extends Record<string, Field<unknown>>>(
  cases: Cases,
): Schema.Codec<CaseValue<Cases>, Raw> => {
  const union: Schema.Codec<unknown, Raw> = Schema.Union(casesOf(cases));

  // SAFETY: each case's schema states the value of that case, which `CaseValue`
  // reads off the same cases.
  return union as Schema.Codec<CaseValue<Cases>, Raw>;
};

const between = (minimum: number, maximum: number): Schema.Codec<number, number> =>
  Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum, maximum })));

const betweenBig = (minimum: bigint, maximum: bigint): Schema.Codec<bigint, bigint> =>
  Schema.BigInt.pipe(Schema.check(Schema.isBetweenBigInt({ minimum, maximum })));

/**
 * The bytes of one message, as the schema of the values its fields hold.
 *
 * **When to use**
 *
 * Use to read and write a message, stated as the fields it holds.
 *
 * **Details**
 *
 * The fields are read in the order they are given, so a field states its
 * length, its count, or its branch by a field declared before it.
 * A field spans exactly the bytes it states, so the message spans the bytes its
 * fields do. Bytes left over are an issue of the decode, since the message
 * states no field for them.
 *
 * A value the bytes cannot state is refused rather than written truncated. A
 * number out of the range of its field, or a region of another size than the
 * field states, is an issue of the encode.
 *
 * **Example** (A chunk header, written and read back)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import * as BinaryProtocol from "@trajs/utils/BinaryProtocol"
 *
 * const Compression = Schema.Enum({ None: 0, Zstd: 1 })
 *
 * const ChunkHeader = BinaryProtocol.message({
 *   metaCrc: BinaryProtocol.u32,
 *   bodyCrc: BinaryProtocol.u32,
 *   bodyLen: BinaryProtocol.u32,
 *   metaLen: BinaryProtocol.u32,
 *   compression: BinaryProtocol.u8.pipe(BinaryProtocol.as(Compression))
 * })
 *
 * const header = {
 *   metaCrc: 7,
 *   bodyCrc: 8,
 *   bodyLen: 9,
 *   metaLen: 0,
 *   compression: Compression.enums.Zstd
 * }
 *
 * const bytes = await Effect.runPromise(Schema.encodeEffect(ChunkHeader)(header))
 * bytes.length // => 17
 *
 * const read = await Effect.runPromise(Schema.decodeEffect(ChunkHeader)(bytes))
 * read.bodyLen // => 9
 * read.compression // => 1
 * ```
 *
 * @see {@link struct} for the fields of a message nested in another.
 * @stability experimental
 * @category constructors
 */
export const message = <Fields extends Record<string, Field<unknown>>>(
  fields: Fields,
  options?: Options,
): Schema.Codec<Value<Fields>, Uint8Array> => {
  const nest = nestField(fields, schemaOf(fields));
  const endianness = endiannessOf(options);

  return Schema.Uint8Array.pipe(
    Schema.decodeTo(nest.schema, {
      decode: SchemaGetter.transformEffect((bytes: Uint8Array) =>
        readMessage(nest, bytes, endianness),
      ),
      encode: SchemaGetter.transformEffect((raw: Raw) => writeMessage(nest, raw, endianness)),
    }),
  );
};

/**
 * The fields of a message nested in another message.
 *
 * **When to use**
 *
 * Use for the fields of a message that appears inside a larger one, such as the
 * entry of a table or the region of a code.
 *
 * **Details**
 *
 * A nested message is read where its field is declared, and it spans the bytes
 * its own fields do. Its fields state their lengths and branches by the fields
 * around them as well as their own, so a length stated before the nested
 * message still sizes a region inside it.
 *
 * The value is an object of the values of the nested fields.
 *
 * @see {@link message} for the message these fields are nested in.
 * @stability experimental
 * @category constructors
 */
export const struct = <Fields extends Record<string, Field<unknown>>>(
  fields: Fields,
): Field<Value<Fields>> => nestField(fields, schemaOf(fields));

/**
 * An unsigned integer of one byte, read as a `number`.
 *
 * **Details**
 *
 * The value is an integer from `0` to `0xff`, and a value outside that range is
 * refused rather than written truncated.
 *
 * @see {@link as} to state the value the byte holds.
 * @stability experimental
 * @category constructors
 */
export const u8: Field<number> = numberField(Numbers.u8, between(0, 0xff));

/**
 * A signed integer of one byte, read as a `number`.
 *
 * **Details**
 *
 * The value is an integer from `-0x80` to `0x7f`.
 *
 * @stability experimental
 * @category constructors
 */
export const i8: Field<number> = numberField(Numbers.i8, between(-0x80, 0x7f));

/**
 * An unsigned integer of two bytes, read as a `number`.
 *
 * **Details**
 *
 * The value is an integer from `0` to `0xffff`, read in the byte order of the
 * message.
 *
 * @stability experimental
 * @category constructors
 */
export const u16: Field<number> = numberField(Numbers.u16, between(0, 0xffff));

/**
 * A signed integer of two bytes, read as a `number`.
 *
 * **Details**
 *
 * The value is an integer from `-0x8000` to `0x7fff`, read in the byte order of
 * the message.
 *
 * @stability experimental
 * @category constructors
 */
export const i16: Field<number> = numberField(Numbers.i16, between(-0x8000, 0x7fff));

/**
 * An unsigned integer of four bytes, read as a `number`.
 *
 * **Details**
 *
 * The value is an integer from `0` to `0xffffffff`, read in the byte order of
 * the message.
 *
 * @stability experimental
 * @category constructors
 */
export const u32: Field<number> = numberField(Numbers.u32, between(0, 0xffffffff));

/**
 * A signed integer of four bytes, read as a `number`.
 *
 * **Details**
 *
 * The value is an integer from `-0x80000000` to `0x7fffffff`, read in the byte
 * order of the message.
 *
 * @stability experimental
 * @category constructors
 */
export const i32: Field<number> = numberField(Numbers.i32, between(-0x80000000, 0x7fffffff));

/**
 * An unsigned integer of eight bytes, read as a `bigint`.
 *
 * **Details**
 *
 * The value is an integer from `0n` to `0xffffffffffffffffn`, which a `number`
 * does not hold whole.
 *
 * @stability experimental
 * @category constructors
 */
export const u64: Field<bigint> = numberField(BigNumbers.u64, betweenBig(0n, 0xffffffffffffffffn));

/**
 * A signed integer of eight bytes, read as a `bigint`.
 *
 * **Details**
 *
 * The value is an integer from `-0x8000000000000000n` to
 * `0x7fffffffffffffffn`.
 *
 * @stability experimental
 * @category constructors
 */
export const i64: Field<bigint> = numberField(
  BigNumbers.i64,
  betweenBig(-0x8000000000000000n, 0x7fffffffffffffffn),
);

/**
 * A float of four bytes, read as a `number`.
 *
 * **Details**
 *
 * The value is any `number`, including the ones the format holds apart from the
 * others, such as `NaN`.
 *
 * @stability experimental
 * @category constructors
 */
export const f32: Field<number> = numberField(Numbers.f32, Schema.Number);

/**
 * A float of eight bytes, read as a `number`.
 *
 * **Details**
 *
 * The value is any `number`, at the width of a JavaScript number.
 *
 * @stability experimental
 * @category constructors
 */
export const f64: Field<number> = numberField(Numbers.f64, Schema.Number);

/**
 * A region of bytes of a stated size, or of every byte left.
 *
 * **When to use**
 *
 * Use for a region whose size the message states as a literal, such as a digest
 * or a padding. Use {@link bytesOf} for a size an earlier field states.
 *
 * **Details**
 *
 * Without a size the region is every byte left, so it ends the message.
 * The value is a view of the bytes of the message, not a copy.
 * A region written from other bytes is refused where their count is not the
 * size stated.
 *
 * @see {@link bytesOf} for a region an earlier field sizes.
 * @stability experimental
 * @category constructors
 */
export const bytes = (size?: number): Field<Uint8Array> =>
  regionField(stated(size), Schema.Uint8Array);

/**
 * A region of bytes as many as an earlier field states.
 *
 * **When to use**
 *
 * Use for a length-prefixed region, such as the body a header states.
 *
 * **Details**
 *
 * The field named holds the size of the region, so it is declared before the
 * region and its value is a number of bytes.
 * The value is a view of the bytes of the message, not a copy.
 * A region written from other bytes is refused where their count is not the
 * size the field states.
 *
 * **Example** (A body the header sizes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import * as BinaryProtocol from "@trajs/utils/BinaryProtocol"
 *
 * const Message = BinaryProtocol.message({
 *   bodyLen: BinaryProtocol.u32,
 *   body: BinaryProtocol.bytesOf("bodyLen")
 * })
 *
 * const bytes = await Effect.runPromise(
 *   Schema.encodeEffect(Message)({ bodyLen: 3, body: new Uint8Array([1, 2, 3]) })
 * )
 * bytes.length // => 7
 *
 * const read = await Effect.runPromise(Schema.decodeEffect(Message)(bytes))
 * Array.from(read.body) // => [1, 2, 3]
 * ```
 *
 * @see {@link bytes} for a region of a stated size.
 * @stability experimental
 * @category constructors
 */
export const bytesOf = (name: string): Field<Uint8Array> =>
  regionField(statedBy(name), Schema.Uint8Array);

/**
 * A value any schema states, embedded as `SchemaBinary` lays it out.
 *
 * **When to use**
 *
 * Use to embed a value whose bytes the message does not state field by field,
 * such as the metadata of a document.
 *
 * **Details**
 *
 * The field spans one frame of `SchemaBinary`, which states its own length, so
 * the fields after it are read from where the frame ends.
 * `SchemaBinary.toCodec` lays out the bytes in its default mode, so any schema
 * is a field, whether its value is a record, an array, or a string.
 * The order of the message does not reach those bytes, which take the order
 * `SchemaBinary` states.
 *
 * **Gotchas**
 *
 * The schema is decoded and encoded without services, so a schema that states
 * services is not a field.
 *
 * **Example** (A name and its tags embedded beside a count)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import * as BinaryProtocol from "@trajs/utils/BinaryProtocol"
 *
 * const Meta = Schema.Struct({ name: Schema.String, tags: Schema.Array(Schema.String) })
 *
 * const Document = BinaryProtocol.message({
 *   count: BinaryProtocol.u16,
 *   meta: BinaryProtocol.frame(Meta)
 * })
 *
 * const bytes = await Effect.runPromise(
 *   Schema.encodeEffect(Document)({ count: 2, meta: { name: "a", tags: ["x", "y"] } })
 * )
 * const read = await Effect.runPromise(Schema.decodeEffect(Document)(bytes))
 * read.meta // => { name: "a", tags: ["x", "y"] }
 * ```
 *
 * @see {@link struct} for fields whose bytes the message states.
 * @see {@link as} for the value the bytes of a field already hold.
 * @stability experimental
 * @category constructors
 */
export const frame = <A>(schema: Schema.Codec<A, unknown, never, never>): Field<A> =>
  frameField(SchemaBinary.toCodec(schema));

/**
 * The fields of one entry, read as many times as stated.
 *
 * **When to use**
 *
 * Use for a repetition whose count the message states as a literal, or that
 * runs to the end of the message. Use {@link repeatOf} for a count an earlier
 * field states.
 *
 * **Details**
 *
 * Without a count, entries are read until the bytes of the message end, so the
 * repetition ends the message.
 * The value is an array of the values of the entry.
 * An array of fewer or more entries than stated is refused where it is written.
 *
 * **Example** (Entries to the end of the message)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import * as BinaryProtocol from "@trajs/utils/BinaryProtocol"
 *
 * const Tail = BinaryProtocol.message({
 *   rest: BinaryProtocol.repeat(BinaryProtocol.u16)
 * })
 *
 * const bytes = new Uint8Array([1, 0, 2, 0])
 * const read = await Effect.runPromise(Schema.decodeEffect(Tail)(bytes))
 * read.rest // => [1, 2]
 * ```
 *
 * @see {@link repeatOf} for a repetition an earlier field counts.
 * @stability experimental
 * @category constructors
 */
export const repeat = <A>(field: Field<A>, count?: number): Field<ReadonlyArray<A>> =>
  repeatField(field, stated(count), Schema.Array(field.schema));

/**
 * The fields of one entry, read as many times as an earlier field states.
 *
 * **When to use**
 *
 * Use for a table the header counts.
 *
 * **Details**
 *
 * The field named holds the count of the entries, so it is declared before the
 * repetition and its value is a number of entries.
 * An array of fewer or more entries than the field states is refused where it is
 * written.
 *
 * **Example** (A table of counted entries)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import * as BinaryProtocol from "@trajs/utils/BinaryProtocol"
 *
 * const Entry = BinaryProtocol.struct({
 *   len: BinaryProtocol.u32,
 *   body: BinaryProtocol.bytesOf("len")
 * })
 *
 * const Table = BinaryProtocol.message({
 *   count: BinaryProtocol.u32,
 *   entries: BinaryProtocol.repeatOf(Entry, "count")
 * })
 *
 * const bytes = await Effect.runPromise(
 *   Schema.encodeEffect(Table)({
 *     count: 1,
 *     entries: [{ len: 2, body: new Uint8Array([7, 8]) }]
 *   })
 * )
 * bytes.length // => 10
 *
 * const read = await Effect.runPromise(Schema.decodeEffect(Table)(bytes))
 * read.entries.length // => 1
 * ```
 *
 * @see {@link repeat} for a repetition of a stated count.
 * @stability experimental
 * @category constructors
 */
export const repeatOf = <A>(field: Field<A>, name: string): Field<ReadonlyArray<A>> =>
  repeatField(field, statedBy(name), Schema.Array(field.schema));

/**
 * One of several layouts, chosen by a code an earlier field read.
 *
 * **When to use**
 *
 * Use where a code states the fields that follow it, such as a message type or
 * a compression algorithm.
 *
 * **Details**
 *
 * The case is chosen by the raw value of the field named, which is read as text,
 * so a code byte of `1` reads the case `"1"`.
 * A code that names no case is an issue of the decode.
 * The value is the union of the values of the cases ({@link CaseValue}).
 *
 * **Example** (A body the code states)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import * as BinaryProtocol from "@trajs/utils/BinaryProtocol"
 *
 * const Message = BinaryProtocol.message({
 *   code: BinaryProtocol.u8,
 *   body: BinaryProtocol.branch("code", {
 *     0: BinaryProtocol.struct({ size: BinaryProtocol.u32 }),
 *     1: BinaryProtocol.struct({ at: BinaryProtocol.f64 })
 *   })
 * })
 *
 * const read = await Effect.runPromise(
 *   Schema.decodeEffect(Message)(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 16, 64]))
 * )
 * read.body // => { at: 4 }
 * ```
 *
 * @see {@link CaseValue} for the value the cases hold.
 * @stability experimental
 * @category constructors
 */
export const branch = <Cases extends Record<string, Field<unknown>>>(
  on: string,
  cases: Cases,
): Field<CaseValue<Cases>> => branchField<CaseValue<Cases>>(on, cases, unionOf(cases));

/**
 * States the value a field's bytes hold.
 *
 * **When to use**
 *
 * Use to give a field a value that its bytes do not name, such as a code of a
 * closed set, a branding, or a number of a range.
 *
 * **Details**
 *
 * The schema decodes the raw value the field read and encodes the value back to
 * it, so a byte that states no value of the schema is an issue of the decode.
 * The bytes the field spans do not change.
 *
 * **Example** (A code byte of a closed set)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 * import * as BinaryProtocol from "@trajs/utils/BinaryProtocol"
 *
 * const Compression = Schema.Enum({ None: 0, Zstd: 1 })
 *
 * const Codec = BinaryProtocol.message({
 *   compression: BinaryProtocol.u8.pipe(BinaryProtocol.as(Compression))
 * })
 *
 * const read = await Effect.runPromise(Schema.decodeEffect(Codec)(new Uint8Array([1])))
 * read.compression // => 1
 * ```
 *
 * @see {@link Field} for the schema it states.
 * @stability experimental
 * @category combining
 */
export const as =
  <A, E extends Raw>(schema: Schema.Codec<A, E>) =>
  (field: Field<unknown>): Field<A> =>
    new FieldCodec(schema, field.read, field.write);
