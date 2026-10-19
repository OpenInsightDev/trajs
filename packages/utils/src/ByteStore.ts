/**
 * The bytes a program keeps between readings: a store of byte sequences, cut into
 * chunks as they are written and read back as a {@link Bytes}.
 *
 * What holds them is the key/value store of `effect/persistence`
 * (`KeyValueStore`) — memory, a file system, a database — so where the bytes live
 * is the store layer's to say rather than this module's, and nothing of how a
 * sequence is kept changes when another store is provided. What is kept of a
 * sequence is the chunks it is cut into rather than one value, so a sequence too
 * large for a store to hold whole is still written to it and read from it: what a
 * read reaches is read, and the chunks it does not are left where they are.
 */

import { Context, Data, Effect, Formatter, Layer, Schema, Sink } from "effect";
import { KeyValueStore } from "effect/persistence";

import { type Bytes, makeBytes } from "#/Bytes.ts";

/**
 * What a sequence is written into a store with.
 *
 * **When to use**
 *
 * Use to type what {@link ByteStore.write} is given, or to state the options where
 * a sequence is written into a store.
 *
 * **Details**
 *
 * - `overwrite` says whether a sequence already held under the id is written over,
 *   and defaults to `true`: a store holds one sequence per id, and writing one
 *   again is how a sequence is kept a second time. A store given `false` fails with
 *   a {@link ByteStoreError} where the id is taken, rather than putting one
 *   sequence where another was.
 *
 * Writing over an id drops what it held before any of the new bytes are written, so
 * a write that ends before the sequence does leaves the id holding nothing rather
 * than the head of one sequence beside the tail of another.
 *
 * @see {@link ByteStore.write} for the operation it is given to.
 */
export interface WriteOptions {
  readonly overwrite?: boolean;
}

/**
 * What a store is built with: how the bytes written to it are cut into chunks.
 *
 * **When to use**
 *
 * Use where a store is built ({@link layer}) and how it cuts a sequence matters —
 * the size a store underneath it serves, or the quota one of a limited size
 * imposes.
 *
 * **Details**
 *
 * - `chunkSize` is how many bytes of a sequence are kept under one key, and
 *   defaults to {@link defaultChunkSize}. It states how a sequence is cut as it is
 *   written rather than how it is read: the size a sequence was written with is
 *   kept beside it, so a store built with one size reads a sequence another wrote.
 *
 * @see {@link defaultChunkSize} for the size a store cuts with where none is stated.
 * @category models
 */
export interface Options {
  readonly chunkSize?: number;
}

/**
 * How many bytes of a sequence are kept under one key where a store states no size:
 * 64 KiB, the size {@link Bytes.stream} reads a sequence in by default.
 *
 * **When to use**
 *
 * Use where a store resolves the option it was built with ({@link Options}), so that
 * what a program stating nothing gets is stated once rather than by each store.
 *
 * **Details**
 *
 * It is the size a read takes at once ({@link Bytes.stream}), so a store keeping a
 * sequence in chunks of it serves the chunks a reader asks for rather than cutting
 * them again, and a chunk of a sequence is read with the size one read of it takes.
 *
 * @see {@link Options} for where the size is stated.
 * @category constants
 */
export const defaultChunkSize = 64 * 1024;

/**
 * A store of byte sequences: the bytes kept under an id, read back as a
 * {@link Bytes}, and the sink a sequence is written through.
 *
 * **When to use**
 *
 * Use to keep the bytes of a trajectory where reading them a second time is cheaper
 * than reading them from a storage again — the frame of a trajectory, say — and to
 * write them without holding the sequence whole.
 *
 * **Details**
 *
 * - `read` serves the bytes kept under an id as a {@link Bytes}, which what reads
 *   them takes what it needs from: the head of a sequence is answered with the chunk
 *   it falls in, and the chunks after it are not read. An id that holds nothing
 *   fails as a {@link ByteStoreError}.
 * - `write` gives the sink a sequence of that id is written through, so its bytes
 *   are cut and kept as they are produced rather than held whole.
 * - `remove` drops what an id holds — its chunks and the record of them — and
 *   removes nothing where the id holds nothing.
 * - `has` says whether an id holds a sequence.
 *
 * Nothing but an id is asked of a caller: how a sequence is cut is the store's to
 * say ({@link Options}), and the keys its chunks are kept under are read off the id
 * rather than stated with it, so an id names a sequence and nothing else of the
 * store.
 *
 * **Example** (Keeping a sequence of bytes and reading part of it back)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { KeyValueStore } from "effect/persistence"
 *
 * import { ByteStore } from "@trajs/utils"
 *
 * const program = Effect.gen(function* () {
 *   const store = yield* ByteStore.ByteStore
 *
 *   // Four bytes to a chunk, so the sequence is kept in two of them.
 *   yield* Stream.make(new TextEncoder().encode("trajs")).pipe(Stream.run(store.write("a")))
 *
 *   return yield* (yield* store.read("a")).readAlloc({ offset: 2n })
 * })
 *
 * const bytes = await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(ByteStore.layer({ chunkSize: 4 })),
 *     Effect.provide(KeyValueStore.layerMemory),
 *   ),
 * )
 *
 * new TextDecoder().decode(bytes) // => "ajs"
 * ```
 *
 * @see {@link layer} for the store this service is provided as.
 */
export interface ByteStore {
  /**
   * Serves the bytes kept under `id` as a {@link Bytes}.
   *
   * What it serves is read at random rather than at once, so a reader takes the part
   * of the sequence it came for: the chunks a read reaches are read out of the store
   * and joined, and none of the others are. An id that holds nothing fails as a
   * {@link ByteStoreError}.
   *
   * The record an id holds when this runs is what the view serves, so a sequence
   * written again while a view of it is open is read as it was; a chunk the view
   * states that the store no longer holds fails the read rather than serving fewer
   * bytes than the sequence states.
   */
  readonly read: (id: string) => Effect.Effect<Bytes<ByteStoreError>, ByteStoreError>;

  /**
   * The sink a sequence is written into `id` through.
   *
   * What is written is cut into chunks as it arrives, and a chunk is kept once it
   * has arrived whole, so a sequence is kept as it is produced rather than once it
   * has ended. Nothing is held open between chunks, so the sink needs no scope of
   * its own.
   *
   * What the id held is dropped before the first byte is written, so a write that
   * ends before the sequence does leaves the id holding nothing rather than the head
   * of one sequence beside the tail of another.
   */
  readonly write: (
    id: string,
    options?: WriteOptions,
  ) => Sink.Sink<void, Uint8Array, never, ByteStoreError>;

  /**
   * Drops what `id` holds: the chunks kept under it and the record naming them.
   */
  readonly remove: (id: string) => Effect.Effect<void, ByteStoreError>;

  /**
   * Says whether `id` holds a sequence.
   */
  readonly has: (id: string) => Effect.Effect<boolean, ByteStoreError>;
}

/**
 * The store a program keeps its bytes in: what `yield* ByteStore` gives reads and
 * writes sequences of bytes over a key/value store.
 *
 * **When to use**
 *
 * Use to require a store of a program, and {@link layer} or {@link make} to provide
 * it.
 *
 * **Details**
 *
 * What holds the bytes is a store of `effect/persistence` rather than a place of
 * this package's, so a store is provided at the composition root of a program and
 * reaches the bytes through the service alone. Which store that is — memory, a file
 * system, a database — is the layer's to say, and nothing of how a sequence is kept
 * changes with it.
 *
 * @see {@link ByteStore} for what the service gives.
 */
export const ByteStore: Context.Service<ByteStore, ByteStore> = Context.Service<
  ByteStore,
  ByteStore
>()("trajs/utils/ByteStore");

/**
 * What a store failed with: bytes that could not be read or written, or an id that
 * holds no sequence.
 *
 * **When to use**
 *
 * Use to tell the failure of a store apart from the failure of the bytes it was
 * asked for: a store that refused, that was cut short, or that holds nothing where
 * an id was named fails as this error, where bytes that do not hold what the reader
 * is reading fail as the reader's own error.
 *
 * **Details**
 *
 * `id` names the sequence the store was asked about — the one whose bytes could not
 * be read, or the one that could not be written — and `cause` is what the store
 * failed with, as it reported it: the failure of the key/value store underneath, or
 * the description of what an id did not hold.
 *
 * @see {@link ByteStore} for what a sequence is read and written through.
 * @category errors
 */
export class ByteStoreError extends Data.TaggedError("ByteStoreError")<{
  id: string;
  cause: unknown;
}> {
  override get message(): string {
    return `Failed to read or write '${this.id}': ${Formatter.format(this.cause)}`;
  }
}

/**
 * What a store keeps of a sequence beside its chunks: how many bytes one chunk
 * holds, and how many bytes the sequence is.
 *
 * The size is kept with the sequence rather than taken from the store that reads it,
 * so a sequence is cut and read the same way whatever store reads it back. The record
 * is kept as the JSON string every `KeyValueStore` layer states, and the length is
 * carried as digits rather than as a JSON number, which cannot hold every length
 * exactly.
 */
const Meta = Schema.Struct({
  chunkSize: Schema.Int.check(Schema.isGreaterThan(0)),
  length: Schema.BigIntFromString,
});

type Meta = Schema.Schema.Type<typeof Meta>;

const MetaFromJson = Schema.fromJsonString(Meta);

const metaKey = (id: string): string => `${id}/meta`;

const chunkKey = (id: string, index: number): string => `${id}/${index}`;

/** How many chunks an id holds, as its record states, or none where it holds no record. */
const chunkCount = (meta: Meta | undefined): number =>
  meta === undefined
    ? 0
    : Number((meta.length + BigInt(meta.chunkSize) - 1n) / BigInt(meta.chunkSize));

/** What the key/value store underneath failed with, as this store reports it. */
const named = <A, R>(
  id: string,
  effect: Effect.Effect<A, KeyValueStore.KeyValueStoreError, R>,
): Effect.Effect<A, ByteStoreError, R> =>
  effect.pipe(Effect.mapError((cause) => new ByteStoreError({ id, cause })));

/** Reads a sequence's record, or nothing where the id holds no sequence. */
const getMeta = (
  store: KeyValueStore.KeyValueStore,
  id: string,
): Effect.Effect<Meta | undefined, ByteStoreError> =>
  named(id, store.get(metaKey(id))).pipe(
    Effect.flatMap((held) =>
      held === undefined
        ? Effect.succeed(undefined)
        : Schema.decodeUnknownEffect(MetaFromJson)(held).pipe(
            Effect.mapError((cause) => new ByteStoreError({ id, cause })),
          ),
    ),
  );

/** Keeps a sequence's record, once the chunks it states have all been written. */
const putMeta = (
  store: KeyValueStore.KeyValueStore,
  id: string,
  meta: Meta,
): Effect.Effect<void, ByteStoreError> =>
  named(id, store.set(metaKey(id), Schema.encodeSync(MetaFromJson)(meta)));

/**
 * Drops what an id holds: the chunks its record states, any chunks the store holds
 * beyond them, and the record itself.
 *
 * A write keeps its chunks from the first one on, so what a store holds under an id is
 * a run of chunks from `0` to the last one written: the record states how long that
 * run is for a write that ended, and where one ended before its record was kept, the
 * run is found by probing for the first chunk the store does not hold.
 */
const drop = (
  store: KeyValueStore.KeyValueStore,
  id: string,
  stated: number,
): Effect.Effect<void, ByteStoreError> =>
  Effect.gen(function* () {
    let index = 0;

    while (index < stated || (yield* named(id, store.has(chunkKey(id, index))))) {
      yield* named(id, store.remove(chunkKey(id, index)));
      index += 1;
    }

    yield* named(id, store.remove(metaKey(id)));
  });

/**
 * Reads the bytes a sequence holds into `buffer`, from `offset` and up to `size` of
 * them, by taking what each chunk it reaches holds of them.
 *
 * A chunk is read only where the read reaches it, so a read of the head of a
 * sequence never reads the chunks after it.
 */
const readInto = (
  store: KeyValueStore.KeyValueStore,
  id: string,
  meta: Meta,
  buffer: Uint8Array,
  offset: bigint,
  size: number,
): Effect.Effect<number, ByteStoreError> =>
  Effect.gen(function* () {
    const chunkSize = BigInt(meta.chunkSize);
    const limit = Math.min(size, buffer.length);
    let position = 0;
    let at = offset;

    // An offset before the start of the sequence, or at its end, reaches no chunk:
    // what is read is what the sequence holds from where the read begins.
    while (position < limit && at >= 0n && at < meta.length) {
      const index = Number(at / chunkSize);
      const within = Number(at % chunkSize);
      const held = yield* named(id, store.getUint8Array(chunkKey(id, index)));

      if (held === undefined) {
        return yield* Effect.fail(
          new ByteStoreError({ id, cause: `the chunk at ${index} is not held` }),
        );
      }

      const taken = Math.min(held.length - within, limit - position);

      if (taken <= 0) {
        return yield* Effect.fail(
          new ByteStoreError({ id, cause: `the chunk at ${index} is shorter than it states` }),
        );
      }

      buffer.set(held.subarray(within, within + taken), position);
      at += BigInt(taken);
      position += taken;
    }

    return position;
  });

const bytesOf = (
  store: KeyValueStore.KeyValueStore,
  id: string,
  meta: Meta,
): Bytes<ByteStoreError> =>
  makeBytes({
    length: Effect.succeed(meta.length),
    read: (buffer, { offset = 0n, size = buffer.length } = {}) =>
      readInto(store, id, meta, buffer, offset, size),
  });

/** A sequence as it is written: the chunks kept so far, and what is left over. */
interface Writing {
  index: number;
  pending: Uint8Array;
  length: bigint;
}

const join = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(left.length + right.length);

  bytes.set(left);
  bytes.set(right, left.length);

  return bytes;
};

/**
 * The sink a sequence is written into an id through: the bytes that arrive are cut
 * into chunks of `chunkSize`, each kept as soon as it has arrived whole, and the
 * record of the sequence is kept once the bytes have ended.
 *
 * What arrives is held only until a chunk is full, and what is held is a copy, so no
 * chunk of the caller's is read again after it has been given.
 */
const writer = (
  store: KeyValueStore.KeyValueStore,
  id: string,
  chunkSize: number,
): Sink.Sink<void, Uint8Array, never, ByteStoreError> =>
  Sink.foldArray<Writing, Uint8Array, ByteStoreError>(
    () => ({ index: 0, pending: new Uint8Array(0), length: 0n }),
    () => true,
    (state, chunks) =>
      Effect.gen(function* () {
        for (const chunk of chunks) {
          const bytes = state.pending.length === 0 ? chunk : join(state.pending, chunk);
          let start = 0;

          while (bytes.length - start >= chunkSize) {
            yield* named(
              id,
              store.set(chunkKey(id, state.index), bytes.slice(start, start + chunkSize)),
            );
            state.index += 1;
            start += chunkSize;
          }

          state.pending = bytes.slice(start);
          state.length += BigInt(chunk.length);
        }

        return state;
      }),
  ).pipe(
    Sink.mapEffect((state) =>
      Effect.gen(function* () {
        if (state.pending.length > 0) {
          yield* named(id, store.set(chunkKey(id, state.index), state.pending));
          state.index += 1;
        }

        yield* putMeta(store, id, { chunkSize, length: state.length });
      }),
    ),
  );

/**
 * Clears what an id holds before a sequence is written into it, so that nothing of
 * what was there is read beside what is written.
 */
const prepare = (
  store: KeyValueStore.KeyValueStore,
  id: string,
  options?: WriteOptions,
): Effect.Effect<void, ByteStoreError> =>
  Effect.gen(function* () {
    const meta = yield* getMeta(store, id);

    if (meta !== undefined && options?.overwrite === false) {
      return yield* Effect.fail(new ByteStoreError({ id, cause: "it already holds a sequence" }));
    }

    yield* drop(store, id, chunkCount(meta));
  });

/**
 * A store over a key/value store: the bytes kept in chunks in the store given.
 *
 * **When to use**
 *
 * Use where a program holds the store itself rather than requiring the one of
 * `effect/persistence` — building this over a store only it knows, say — or to state
 * the layer this package ships from ({@link layer}).
 *
 * **Details**
 *
 * What the key/value store is given of a sequence is the chunks it is cut into rather
 * than the sequence itself ({@link Options}), so a sequence written through this is
 * held in the chunks of the size it was built with, whatever the size the bytes
 * arrived in.
 *
 * @see {@link ByteStore} for what the store gives.
 * @see {@link layer} for the same store as a layer.
 * @category constructors
 */
export const make = (store: KeyValueStore.KeyValueStore, options?: Options): ByteStore => {
  const chunkSize = options?.chunkSize ?? defaultChunkSize;

  return {
    read: (id) =>
      Effect.gen(function* () {
        const meta = yield* getMeta(store, id);

        if (meta === undefined) {
          return yield* Effect.fail(new ByteStoreError({ id, cause: "it holds no bytes" }));
        }

        return bytesOf(store, id, meta);
      }),
    write: (id, writeOptions) =>
      prepare(store, id, writeOptions).pipe(Effect.as(writer(store, id, chunkSize)), Sink.unwrap),
    remove: (id) =>
      Effect.gen(function* () {
        const meta = yield* getMeta(store, id);

        yield* drop(store, id, chunkCount(meta));
      }),
    has: (id) => getMeta(store, id).pipe(Effect.map((meta) => meta !== undefined)),
  };
};

/**
 * The store this package ships: byte sequences kept in chunks in the key/value store
 * of `effect/persistence`.
 *
 * **When to use**
 *
 * Use to keep bytes in the store a program states — memory, a file system, a
 * database — without naming one of them here: a store is provided wherever the bytes
 * are to live, and this reads and writes sequences over it.
 *
 * **Details**
 *
 * A sequence is kept as one record beside the chunks it is cut into, and both are
 * named by the id alone, so a store may hold sequences from more than one part of a
 * program without them meeting: an id names one sequence, and nothing else of the
 * store is read to find it.
 *
 * `options` states how a sequence is cut as it is written ({@link Options}), and the
 * size a sequence was written with is read back from the store, so this reads a
 * sequence written by a store built with another size.
 *
 * @see {@link ByteStore} for the store this provides.
 * @see {@link make} for the same store built over a store at hand.
 * @category layers
 */
export const layer = (
  options?: Options,
): Layer.Layer<ByteStore, never, KeyValueStore.KeyValueStore> =>
  Layer.effect(
    ByteStore,
    KeyValueStore.KeyValueStore.pipe(Effect.map((store) => make(store, options))),
  );
