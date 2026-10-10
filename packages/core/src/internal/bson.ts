/**
 * Encodes and decodes a stream of BSON documents in Effect channels.
 *
 * BSON delimits nothing: unlike newline-delimited JSON, one document does not
 * mark where it ends, because every document states its own size in its first
 * four bytes. A stream of records is therefore their documents written back to
 * back, and {@link decode} can split it wherever a chunk boundary falls.
 */

import { BSON } from "bson";
import { Cause, Channel, Effect, Formatter, Option, Pull, Schema } from "effect";
import * as Arr from "effect/Array";

/**
 * Error raised when records cannot be packed into documents, or documents
 * cannot be unpacked into records.
 */
export class BsonError extends Schema.TaggedError<BsonError>("trajs/BsonError")("BsonError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Failed to read or write BSON documents: ${Formatter.format(this.cause)}`;
  }
}

/** Bytes of the size prefix every BSON document starts with. */
const sizeBytes = 4;

/** Smallest a document can be: its size prefix, a type byte and a terminator. */
const smallestDocumentBytes = 5;

/**
 * Packs the records of one chunk into the bytes of one BSON document each.
 *
 * A record is the header of a recording or the encoded document of a part, so
 * the values it holds are JSON values, which BSON stores without loss.
 */
const packDocuments = (
  records: Arr.NonEmptyReadonlyArray<unknown>,
): Arr.NonEmptyReadonlyArray<Uint8Array> =>
  Arr.map(records, (record) =>
    // SAFETY: the records of a trajectory are its header and its encoded parts,
    // which are JSON documents, and BSON stores every JSON value.
    BSON.serialize(record as BSON.Document),
  );

const announceSize = (buffer: Uint8Array, offset: number): number =>
  new DataView(buffer.buffer, buffer.byteOffset + offset, sizeBytes).getInt32(0, true);

/** Joins the bytes held back with the chunks just read, so a document can span them. */
const joinBytes = (held: Uint8Array, chunks: Arr.NonEmptyReadonlyArray<Uint8Array>): Uint8Array => {
  let size = held.length;

  for (const chunk of chunks) {
    size += chunk.length;
  }

  const joined = new Uint8Array(size);

  joined.set(held, 0);

  let offset = held.length;

  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }

  return joined;
};

/**
 * Creates a channel that packs each record into a BSON document.
 *
 * Records that cannot be packed fail with {@link BsonError}.
 */
export const encode = <Err = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  Err | BsonError,
  Done,
  Arr.NonEmptyReadonlyArray<unknown>,
  Err,
  Done
> =>
  Channel.identity<Arr.NonEmptyReadonlyArray<unknown>, Err, Done>().pipe(
    Channel.mapEffect((records) =>
      Effect.sync(() => packDocuments(records)).pipe(
        Effect.catchDefect((cause) => Effect.fail(new BsonError({ cause }))),
      ),
    ),
  );

/**
 * Creates a channel that unpacks a record from each BSON document.
 *
 * Documents may span input chunks, and the bytes of a document that never
 * arrived fail with {@link BsonError} rather than ending the stream quietly, so
 * a recording that was cut short is not read as a shorter recording. Bytes that
 * do not unpack at all fail the same way.
 */
export const decode = <Err = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<unknown>,
  Err | BsonError,
  Done,
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  Err,
  Done
> =>
  Channel.fromTransform((upstream, _scope) =>
    Effect.sync(() => {
      // The bytes of a document whose end has not arrived yet, carried across
      // the chunks that follow.
      let held: Uint8Array = new Uint8Array(0);
      // Remembers the upstream Done value after the upstream first signals
      // completion, so later pulls return Done without pulling it again.
      let done = Option.none<Done>();

      /** Reads the whole documents at the front of the chunk, holding the rest back. */
      const takeDocuments = (
        chunk: Arr.NonEmptyReadonlyArray<Uint8Array>,
      ): Arr.NonEmptyReadonlyArray<unknown> | null => {
        const buffer = joinBytes(held, chunk);
        const documents: Array<unknown> = [];
        let offset = 0;

        while (buffer.length - offset >= sizeBytes) {
          const size = announceSize(buffer, offset);

          // A size that is not a document's, or a document whose end has not
          // arrived, leaves the bytes held back for the chunk that carries them.
          if (size < smallestDocumentBytes || offset + size > buffer.length) {
            break;
          }

          documents.push(BSON.deserialize(buffer.subarray(offset, offset + size)));
          offset += size;
        }

        held = buffer.subarray(offset);

        return Arr.isReadonlyArrayNonEmpty(documents) ? documents : null;
      };

      const flush = (
        leftover: Done,
      ): Pull.Pull<Arr.NonEmptyReadonlyArray<unknown>, Err | BsonError, Done> => {
        done = Option.some(leftover);

        if (held.length === 0) {
          return Cause.done(leftover);
        }

        // No more bytes arrive, so the bytes held back are the start of a
        // document that was cut short.
        return Effect.fail(
          new BsonError({
            cause: `the stream ends inside a document, ${held.length} bytes after it starts`,
          }),
        );
      };

      const pullOrFlush: Pull.Pull<
        Arr.NonEmptyReadonlyArray<unknown>,
        Err | BsonError,
        Done
      > = Effect.suspend(() => {
        if (Option.isSome(done)) {
          return Cause.done(done.value);
        }

        return Pull.matchEffect(upstream, {
          onSuccess: loop,
          onFailure: Effect.failCause,
          onDone: flush,
        });
      });

      const loop = (
        chunk: Arr.NonEmptyReadonlyArray<Uint8Array>,
      ): Pull.Pull<Arr.NonEmptyReadonlyArray<unknown>, Err | BsonError, Done> =>
        Effect.sync(() => takeDocuments(chunk)).pipe(
          Effect.catchDefect((cause) => Effect.fail(new BsonError({ cause }))),
          Effect.flatMap((documents) =>
            documents === null ? pullOrFlush : Effect.succeed(documents),
          ),
        );

      return pullOrFlush;
    }),
  );
