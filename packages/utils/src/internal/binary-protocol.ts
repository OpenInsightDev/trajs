/**
 * The bytes a protocol's fields span, and the raws they state.
 *
 * A field reads the bytes it spans into a raw value, and writes a raw value back
 * as those bytes. The schema of a field states the value its raw holds, so one
 * declaration both reads and writes a message.
 *
 * Fields are laid out in the order they are declared, and read from the start of
 * the message or from its end. A field states its length, its count, or its
 * branch by a raw value an earlier field read.
 */

import { Effect, Pipeable, Schema, SchemaIssue } from "effect";

import type { Direction, Endianness, Field } from "#/BinaryProtocol.ts";

/**
 * The raw value a field's bytes state, before its schema names the value.
 *
 * A raw is as wide as the bytes it is read from, so a number holds what a number
 * field states and a byte region holds the bytes it spans.
 */
export type Raw =
  | number
  | bigint
  | Uint8Array
  | ReadonlyArray<Raw>
  | { readonly [name: string]: Raw };

/**
 * The raw values a message has read, and the ones the enclosing fields read.
 *
 * A field sees its own fields and the ones around it, so a length stated before
 * a nested message sizes a region inside it.
 */
export interface Bindings {
  readonly own: Record<string, Raw>;
  readonly around: Bindings | undefined;
}

/** What a message's bytes are read from, and where the read has got to. */
export interface Reading {
  readonly bytes: Uint8Array;
  readonly view: DataView;

  /** The next byte read forwards, or the start of the region read backwards. */
  position: number;

  /** Whether the read takes the bytes before the region it has, not after. */
  readonly backward: boolean;

  readonly endianness: Endianness;
}

/** Where a message's bytes are written to, as one chunk per field. */
export interface Writing {
  readonly chunks: Array<Uint8Array>;
  readonly endianness: Endianness;
}

export type Read = (at: Reading, around: Bindings) => Effect.Effect<Raw, SchemaIssue.Issue>;

export type Write = (
  raw: Raw,
  at: Writing,
  around: Bindings,
) => Effect.Effect<void, SchemaIssue.Issue>;

/** The issue of bytes or values that state nothing a message asks for. */
const issue = (message: string, input?: Raw): SchemaIssue.Issue =>
  new SchemaIssue.InvalidValue({ message }, input);

/** The issue of a failure placed at the name of the field it happened in. */
const inField =
  (name: string) =>
  (cause: SchemaIssue.Issue): SchemaIssue.Issue =>
    new SchemaIssue.Pointer([name], cause);

/**
 * A field as the machine holds it.
 *
 * The schema states the value, and the reads and writes are made over the bytes
 * the field spans, so a field is not itself a schema.
 */
export class FieldCodec<A> extends Pipeable.Class implements Field<A> {
  readonly schema: Schema.Codec<A, Raw>;
  readonly read: Read;
  readonly write: Write;

  constructor(schema: Schema.Codec<A, Raw>, read: Read, write: Write) {
    super();

    this.schema = schema;
    this.read = read;
    this.write = write;
  }
}

const reading = (bytes: Uint8Array, endianness: Endianness, direction: Direction): Reading => {
  const backward = direction === "backward";

  return {
    bytes,
    // The view is taken over the bytes given, not over the buffer behind them, so
    // a region beginning inside a larger buffer reads from where it begins.
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    position: backward ? bytes.length : 0,
    backward,
    endianness,
  };
};

const writing = (endianness: Endianness): Writing => ({ chunks: [], endianness });

const written = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  let length = 0;

  for (const chunk of chunks) {
    length += chunk.length;
  }

  const bytes = new Uint8Array(length);
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

/**
 * The raw values no field has read yet.
 *
 * No field writes to it, so one value serves every message.
 */
const Root: Bindings = { own: {}, around: undefined };

/** How many bytes the read can still take. */
const left = (at: Reading): number => (at.backward ? at.position : at.bytes.length - at.position);

const isNumber = Schema.is(Schema.Number);

const isBigInt = Schema.is(Schema.BigInt);

const isBytes = (raw: Raw): raw is Uint8Array => raw instanceof Uint8Array;

const isEntries = (raw: Raw): raw is ReadonlyArray<Raw> => Array.isArray(raw);

/**
 * Whether a raw holds the record a nested message states.
 *
 * A raw is one of five shapes, so a record is what the other four are not.
 */
const isNest = (raw: Raw): raw is { readonly [name: string]: Raw } =>
  !isBytes(raw) && !isEntries(raw) && !isNumber(raw) && !isBigInt(raw);

/** The issue of bytes that end before the bytes a field asks for. */
const short = (at: Reading, bytes: number, what: string): SchemaIssue.Issue =>
  issue(`the bytes hold ${left(at)} of the ${bytes} bytes of ${what}`);

/**
 * The offset of the next `length` bytes, which the read moves over.
 *
 * A forward read takes the bytes after the region it has, and a backward read the
 * ones before, so a field spans the same bytes in either direction.
 */
const advance = (
  at: Reading,
  length: number,
  what: string,
): Effect.Effect<number, SchemaIssue.Issue> =>
  Effect.gen(function* () {
    if (left(at) < length) {
      return yield* Effect.fail(short(at, length, what));
    }

    if (at.backward) {
      at.position -= length;

      return at.position;
    }

    const start = at.position;

    at.position += length;

    return start;
  });

/** A number's width, and how its bytes are read and written. */
interface Kind<A extends Raw> {
  readonly bytes: number;

  /** The number the kind holds, as an issue about it names the number. */
  readonly what: "number" | "bigint";

  /** Whether a number written is read back whole, as an integer is and a float is not. */
  readonly whole: boolean;

  /** Whether a raw holds this kind of number. */
  readonly holds: (raw: Raw) => raw is A;

  readonly read: (view: DataView, at: number, little: boolean) => A;
  readonly write: (view: DataView, at: number, value: A, little: boolean) => void;
}

/** The unsigned integers, signed integers, and floats of at most 32 bits. */
export const Numbers = {
  u8: {
    bytes: 1,
    what: "number",
    whole: true,
    holds: isNumber,
    read: (view, at) => view.getUint8(at),
    write: (view, at, value) => view.setUint8(at, value),
  },
  i8: {
    bytes: 1,
    what: "number",
    whole: true,
    holds: isNumber,
    read: (view, at) => view.getInt8(at),
    write: (view, at, value) => view.setInt8(at, value),
  },
  u16: {
    bytes: 2,
    what: "number",
    whole: true,
    holds: isNumber,
    read: (view, at, little) => view.getUint16(at, little),
    write: (view, at, value, little) => view.setUint16(at, value, little),
  },
  i16: {
    bytes: 2,
    what: "number",
    whole: true,
    holds: isNumber,
    read: (view, at, little) => view.getInt16(at, little),
    write: (view, at, value, little) => view.setInt16(at, value, little),
  },
  u32: {
    bytes: 4,
    what: "number",
    whole: true,
    holds: isNumber,
    read: (view, at, little) => view.getUint32(at, little),
    write: (view, at, value, little) => view.setUint32(at, value, little),
  },
  i32: {
    bytes: 4,
    what: "number",
    whole: true,
    holds: isNumber,
    read: (view, at, little) => view.getInt32(at, little),
    write: (view, at, value, little) => view.setInt32(at, value, little),
  },
  f32: {
    bytes: 4,
    what: "number",
    whole: false,
    holds: isNumber,
    read: (view, at, little) => view.getFloat32(at, little),
    write: (view, at, value, little) => view.setFloat32(at, value, little),
  },
  f64: {
    bytes: 8,
    what: "number",
    whole: false,
    holds: isNumber,
    read: (view, at, little) => view.getFloat64(at, little),
    write: (view, at, value, little) => view.setFloat64(at, value, little),
  },
} satisfies Record<string, Kind<number>>;

/** The numbers of 64 bits, which are held as a `bigint` instead of a `number`. */
export const BigNumbers = {
  u64: {
    bytes: 8,
    what: "bigint",
    whole: true,
    holds: isBigInt,
    read: (view, at, little) => view.getBigUint64(at, little),
    write: (view, at, value, little) => view.setBigUint64(at, value, little),
  },
  i64: {
    bytes: 8,
    what: "bigint",
    whole: true,
    holds: isBigInt,
    read: (view, at, little) => view.getBigInt64(at, little),
    write: (view, at, value, little) => view.setBigInt64(at, value, little),
  },
} satisfies Record<string, Kind<bigint>>;

const writeNumber = <A extends Raw>(
  kind: Kind<A>,
  raw: Raw,
  at: Writing,
): Effect.Effect<void, SchemaIssue.Issue> =>
  Effect.gen(function* () {
    if (!kind.holds(raw)) {
      return yield* Effect.fail(issue(`a ${kind.what} field holds a ${kind.what}`, raw));
    }

    const bytes = new Uint8Array(kind.bytes);
    const view = new DataView(bytes.buffer);

    kind.write(view, 0, raw, at.endianness === "le");

    // A number the bytes cannot hold whole is refused rather than written as the
    // bytes it wraps to.
    if (kind.whole && kind.read(view, 0, at.endianness === "le") !== raw) {
      return yield* Effect.fail(
        issue("the bytes of the field do not hold the number written", raw),
      );
    }

    at.chunks.push(bytes);
  });

/** A number of the width of `kind`, read in the byte order of the message. */
export const numberField = <A extends Raw>(
  kind: Kind<A>,
  schema: Schema.Codec<A, A>,
): FieldCodec<A> =>
  new FieldCodec(
    schema,
    (at) =>
      Effect.gen(function* () {
        const start = yield* advance(at, kind.bytes, `a ${kind.what}`);

        return kind.read(at.view, start, at.endianness === "le");
      }),
    (raw, at) => writeNumber(kind, raw, at),
  );

/** The raw value a field name states, or why no field of that name was read. */
const lookup = (name: string, around: Bindings): Effect.Effect<Raw, SchemaIssue.Issue> =>
  Effect.gen(function* () {
    let scope: Bindings | undefined = around;

    while (scope !== undefined) {
      const raw = scope.own[name];

      if (raw !== undefined) {
        return raw;
      }

      scope = scope.around;
    }

    return yield* Effect.fail(issue(`no field named \`${name}\` is read before it`));
  });

/** The count of bytes or entries that an earlier field states. */
const countOf = (name: string, around: Bindings): Effect.Effect<number, SchemaIssue.Issue> =>
  Effect.gen(function* () {
    const raw = yield* lookup(name, around);

    if (isNumber(raw)) {
      return raw;
    }

    if (isBigInt(raw)) {
      return Number(raw);
    }

    return yield* Effect.fail(issue(`\`${name}\` states a count, so it holds a number`, raw));
  });

/**
 * How many bytes or entries a field takes.
 *
 * The message states the number as a literal, as an earlier field, or not at all,
 * which takes everything left.
 */
interface Count {
  /** The number the message states, or nothing where the field takes everything left. */
  readonly resolve: (around: Bindings) => Effect.Effect<number | undefined, SchemaIssue.Issue>;

  /** The earlier field that states the number, where one does. */
  readonly name: string | undefined;
}

/** A count the message states as a number, or nothing where it takes everything left. */
export const stated = (size: number | undefined): Count => ({
  resolve: () => Effect.succeed(size),
  name: undefined,
});

/** A count an earlier field states. */
export const statedBy = (name: string): Count => ({
  resolve: (around) => countOf(name, around),
  name,
});

/** The region a size states, as an issue about bytes that fall short of it names it. */
const regionOf = (count: Count): string =>
  count.name === undefined ? "a region" : `the region \`${count.name}\` states`;

/** The field that states a number, as an issue about another number names it. */
const sourceOf = (count: Count): string =>
  count.name === undefined ? "the field" : `\`${count.name}\``;

/** A region of bytes, as many as `count` states. */
export const regionField = (
  count: Count,
  schema: Schema.Codec<Uint8Array, Uint8Array>,
): FieldCodec<Uint8Array> =>
  new FieldCodec(
    schema,
    (at, around) =>
      Effect.gen(function* () {
        const length = (yield* count.resolve(around)) ?? left(at);
        const start = yield* advance(at, length, regionOf(count));

        return at.bytes.subarray(start, start + length);
      }),
    (raw, at, around) =>
      Effect.gen(function* () {
        if (!isBytes(raw)) {
          return yield* Effect.fail(issue("a byte region holds bytes", raw));
        }

        const length = yield* count.resolve(around);

        if (length !== undefined && raw.length !== length) {
          return yield* Effect.fail(
            issue(
              `the region holds ${raw.length} bytes, and ${sourceOf(count)} states ${length}`,
              raw,
            ),
          );
        }

        at.chunks.push(raw);
      }),
  );

/** The most bytes the length of a frame takes. */
const FrameLengthBytes = 10;

/**
 * How many bytes the frame at `offset` spans, or nothing where the bytes there
 * hold no whole frame.
 *
 * A frame states its own length first, so where it ends is read from the bytes
 * rather than from the value they hold.
 */
const frameSize = (bytes: Uint8Array, offset: number): number | undefined => {
  let scale = 1;
  let length = 0;

  for (let at = offset; at < offset + FrameLengthBytes && at < bytes.length; at += 1) {
    const byte = bytes[at]!;

    length += (byte & 0x7f) * scale;

    if ((byte & 0x80) === 0) {
      const size = at + 1 - offset + length;

      return offset + size > bytes.length ? undefined : size;
    }

    scale *= 128;
  }

  return undefined;
};

/** A value any schema states, as the one frame `SchemaBinary` writes for it. */
export const frameField = <A>(schema: Schema.Codec<A, Raw>): FieldCodec<A> =>
  new FieldCodec(
    schema,
    (at) =>
      Effect.gen(function* () {
        if (at.backward) {
          return yield* Effect.fail(
            issue("a frame states its length before its bytes, so a backward read cannot place it"),
          );
        }

        const size = frameSize(at.bytes, at.position);

        if (size === undefined) {
          return yield* Effect.fail(issue("the bytes hold no whole frame"));
        }

        const start = yield* advance(at, size, "a frame");

        return at.bytes.subarray(start, start + size);
      }),
    (raw, at) =>
      Effect.gen(function* () {
        if (!isBytes(raw)) {
          return yield* Effect.fail(issue("a frame holds bytes", raw));
        }

        // The bytes written state where the frame ends, so a field spans one
        // whole frame where it is written as well as where it is read.
        if (frameSize(raw, 0) !== raw.length) {
          return yield* Effect.fail(issue("a frame holds one whole frame", raw));
        }

        at.chunks.push(raw);
      }),
  );

/** The fields of one entry, read as many times as `count` states. */
export const repeatField = <A>(
  field: Field<A>,
  count: Count,
  schema: Schema.Codec<ReadonlyArray<A>, ReadonlyArray<Raw>>,
): FieldCodec<ReadonlyArray<A>> =>
  new FieldCodec(
    schema,
    (at, around) =>
      Effect.gen(function* () {
        const size = yield* count.resolve(around);
        const values: Array<Raw> = [];

        while (size === undefined ? left(at) > 0 : values.length < size) {
          values.push(yield* field.read(at, around));
        }

        // A backward read takes the entries from the last one, so the value keeps
        // the order the bytes state.
        return at.backward ? values.reverse() : values;
      }),
    (raw, at, around) =>
      Effect.gen(function* () {
        if (!isEntries(raw)) {
          return yield* Effect.fail(issue("a repetition holds entries", raw));
        }

        const size = yield* count.resolve(around);

        if (size !== undefined && raw.length !== size) {
          return yield* Effect.fail(
            issue(
              `the repetition holds ${raw.length} entries, and ${sourceOf(count)} states ${size}`,
              raw,
            ),
          );
        }

        for (const entry of raw) {
          yield* field.write(entry, at, around);
        }
      }),
  );

/** The field one of the cases of a branch states, or why none is stated. */
const caseOf = (
  cases: Readonly<Record<string, Field<unknown>>>,
  on: string,
  around: Bindings,
): Effect.Effect<Field<unknown>, SchemaIssue.Issue> =>
  Effect.gen(function* () {
    const raw = yield* lookup(on, around);

    if (!isNumber(raw) && !isBigInt(raw)) {
      return yield* Effect.fail(issue(`\`${on}\` states a case, so it holds a number`, raw));
    }

    const key = String(raw);
    const chosen = cases[key];

    if (chosen === undefined) {
      return yield* Effect.fail(
        issue(`\`${on}\` states ${key}, which names no case of the branch`, raw),
      );
    }

    return chosen;
  });

/** One of the cases of a branch, read and written where the code states it. */
export const branchField = <A>(
  on: string,
  cases: Readonly<Record<string, Field<unknown>>>,
  schema: Schema.Codec<A, Raw>,
): FieldCodec<A> =>
  new FieldCodec(
    schema,
    (at, around) =>
      Effect.gen(function* () {
        const chosen = yield* caseOf(cases, on, around);

        return yield* chosen.read(at, around);
      }),
    (raw, at, around) =>
      Effect.gen(function* () {
        const chosen = yield* caseOf(cases, on, around);

        yield* chosen.write(raw, at, around);
      }),
  );

/** The fields of a message nested in another, read and written where it stands. */
export const nestField = <A>(
  fields: Readonly<Record<string, Field<unknown>>>,
  schema: Schema.Codec<A, Raw>,
): FieldCodec<A> =>
  new FieldCodec(
    schema,
    (at, around) =>
      Effect.gen(function* () {
        const own: Record<string, Raw> = {};
        const inner: Bindings = { own, around };
        // A backward read states a length after the bytes it sizes, so it reads
        // the fields in the reverse of the order they are declared.
        const entries = Object.entries(fields);

        for (const [name, field] of at.backward ? entries.reverse() : entries) {
          own[name] = yield* field.read(at, inner).pipe(Effect.mapError(inField(name)));
        }

        return own;
      }),
    (raw, at, around) =>
      Effect.gen(function* () {
        if (!isNest(raw)) {
          return yield* Effect.fail(issue("a nested message holds the record of its fields", raw));
        }

        const own: Record<string, Raw> = {};
        const inner: Bindings = { own, around };
        const entries = Object.entries(fields);

        // Every value is known before any byte is written, so a field states its
        // size by a field declared after it as well.
        for (const [name] of entries) {
          const value = raw[name];

          if (value === undefined) {
            return yield* Effect.fail(issue(`no value is written for \`${name}\``)).pipe(
              Effect.mapError(inField(name)),
            );
          }

          own[name] = value;
        }

        for (const [name, field] of entries) {
          yield* field.write(own[name], at, inner).pipe(Effect.mapError(inField(name)));
        }
      }),
  );

/** Reads the fields of one message from its bytes, or fails with why they state none. */
export const readMessage = (
  nest: Field<unknown>,
  bytes: Uint8Array,
  endianness: Endianness,
  direction: Direction,
): Effect.Effect<Raw, SchemaIssue.Issue> =>
  Effect.gen(function* () {
    const at = reading(bytes, endianness, direction);
    const raw = yield* nest.read(at, Root);

    // The message ends where its fields do, so bytes left over are bytes it does
    // not state. A backward read leaves them before the fields.
    if (left(at) !== 0) {
      return yield* Effect.fail(
        issue(`the bytes hold ${left(at)} more than the fields of the message`),
      );
    }

    return raw;
  });

/** Writes the fields of one message as its bytes, or fails with why they cannot. */
export const writeMessage = (
  nest: Field<unknown>,
  raw: Raw,
  endianness: Endianness,
): Effect.Effect<Uint8Array, SchemaIssue.Issue> =>
  Effect.gen(function* () {
    const at = writing(endianness);

    yield* nest.write(raw, at, Root);

    return written(at.chunks);
  });
