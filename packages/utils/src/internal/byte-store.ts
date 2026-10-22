/**
 * A store of byte sequences over the key/value store of `effect/persistence`, as
 * `ByteStore.make` provides it.
 */

import { Effect, Schema, Sink } from "effect";
import { KeyValueStore } from "effect/persistence";

import { type Bytes, makeBytes } from "#/Bytes.ts";
import {
  type ByteStore,
  ByteStoreError,
  defaultChunkSize,
  type Options,
  type WriteOptions,
} from "#/ByteStore.ts";

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
 *
 * Nothing is removed where the id holds nothing: a key/value store is not asked to
 * remove a key it does not hold, which the one over a file system fails rather than
 * ignoring.
 */
const drop = (
  store: KeyValueStore.KeyValueStore,
  id: string,
  meta: Meta | undefined,
): Effect.Effect<void, ByteStoreError> =>
  Effect.gen(function* () {
    const stated = chunkCount(meta);
    let index = 0;

    while (index < stated || (yield* named(id, store.has(chunkKey(id, index))))) {
      yield* named(id, store.remove(chunkKey(id, index)));
      index += 1;
    }

    if (meta !== undefined) {
      yield* named(id, store.remove(metaKey(id)));
    }
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

    yield* drop(store, id, meta);
  });

export const keyValueStoreBytes = (
  store: KeyValueStore.KeyValueStore,
  options?: Options,
): ByteStore => {
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

        yield* drop(store, id, meta);
      }),
    has: (id) => getMeta(store, id).pipe(Effect.map((meta) => meta !== undefined)),
  };
};
