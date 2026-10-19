/**
 * The frames a body is carried in: where one ends in a stream of bytes, and reading a
 * body as the values of one schema they carry.
 *
 * A frame is one value of a schema written by `SchemaBinary`, which states the length of
 * everything after it before it states anything else of it, so where a frame ends is
 * known before what it carries is read. The frames of a body are therefore cut by their
 * own lengths rather than handed to one parser, which is what the exchange reads a
 * trajectory's parts with: a frame the schema does not read — a metric part of a metric
 * the kit names none of, say — is stepped over, and the frames after it are read as if it
 * were not there. That is what lets a trajectory one kit wrote be read under another.
 *
 * Nothing here says what a frame means: the schema given states that. What this states is
 * the framing — how many bytes a frame is, and what a body that is not a whole number of
 * frames is.
 *
 * One thing of `SchemaBinary` is assumed, since the boundary of a frame is read before the
 * value it carries: a frame states the length of everything after its length prefix, as a
 * uvarint, and that prefix is the only part of a frame this reads — the envelope byte, the
 * fingerprint of a mode and the body all lie inside the length it states. A change to how
 * a value is framed would move the boundaries read here, and since a frame that does not
 * read is stepped over rather than failing ({@link readFrames}), such a change shows up as
 * values missing from a body rather than as an error: this is the first thing to look at
 * where a trajectory reads as too few parts.
 */

import { Effect, Schema, Stream } from "effect";
import * as Arr from "effect/Array";
import { SchemaBinary } from "effect/encoding";

import { TrajectoryError } from "#/TrajectoryError.ts";

/** How many bytes state the length of a frame at most: the width of the largest one. */
const LengthPrefixBytes = 10;

/**
 * The first frame `bytes` holds whole, with how many bytes of `bytes` it takes, or
 * `undefined` where `bytes` do not hold one.
 *
 * Where a frame ends is read off the bytes themselves, so what a frame carries does not
 * have to be read to know how much of it there is.
 */
const frameOf = (bytes: Uint8Array): readonly [Uint8Array, number] | undefined => {
  let prefix = 0;
  let length = 0;

  while (prefix < LengthPrefixBytes && prefix < bytes.length) {
    const byte = bytes[prefix]!;

    length += (byte & 0x7f) * 2 ** (7 * prefix);
    prefix += 1;

    if ((byte & 0x80) === 0) {
      const end = prefix + length;

      return end > bytes.length ? undefined : [bytes.subarray(0, end), end];
    }
  }

  // A length no frame states is not a frame at all, so there is no end of one to step
  // over: what is read of such bytes is the failure of a body that does not end.
  return undefined;
};

/** The bytes of `chunks` as they arrive, after the bytes `carried` read before them. */
export const joined = (carried: Uint8Array, chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  if (carried.length === 0 && chunks.length === 1) {
    return chunks[0]!;
  }

  const bytes = new Uint8Array(
    carried.length + chunks.reduce((size, chunk) => size + chunk.length, 0),
  );

  bytes.set(carried);

  let at = carried.length;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

/**
 * Reads the frames of a body as the values the schema states.
 *
 * **When to use**
 *
 * Use to read a body of frames as the values they carry, whatever stream the bytes
 * arrive in.
 *
 * **Details**
 *
 * - A frame is one value, and the frames of a body come out in the order they were
 *   written, whether a frame shares a chunk with the frames around it or spans several.
 * - A frame the schema does not read is stepped over, and the frames after it are read
 *   as if it were not there: a value is read by the schema that states it, so what a
 *   schema does not state is not a value of the reading.
 * - A body that ends in the middle of a frame fails as a {@link TrajectoryError} rather
 *   than losing the value silently.
 *
 * The schema is given first and a stream of the bytes after, so that what reads them is
 * curried out of the schema alone.
 *
 * @see {@link SchemaBinary} for the frame a value is written as.
 * @category combinators
 */
export const readFrames =
  <S extends Schema.Constraint>(schema: S) =>
  <E, R>(body: Stream.Stream<Uint8Array, E, R>): Stream.Stream<S["Type"], E | TrajectoryError, R> =>
    Stream.suspend(() => {
      // The frames are not handed to one parser for the whole body: a parser that failed
      // a frame is spent, and the frames after it are read as if it were not there. A
      // codec states one frame of the schema and `SchemaBinary` keeps one per schema, so
      // it is derived here once rather than for every frame, and a frame it does not read
      // is the failure it throws — which leaves the frames after it untouched.
      const decode = Schema.decodeUnknownSync(
        // SAFETY: a frame is read synchronously, which only a reading that takes no
        // service can do; what a schema states its own reading takes is not taken by
        // `readFrames`, whose reading carries the services of the stream it is given.
        SchemaBinary.toCodec(schema) as Schema.Codec<
          S["Type"],
          Uint8Array<ArrayBuffer>,
          never,
          never
        >,
      );

      // A frame the schema does not read states no value of the body.
      const read = (frame: Uint8Array): ReadonlyArray<S["Type"]> => {
        try {
          return [decode(frame)];
        } catch {
          return [];
        }
      };

      // The bytes a chunk ended in the middle of a frame with, which the next chunk
      // completes.
      let carried: Uint8Array = new Uint8Array();

      return body.pipe(
        Stream.mapAccumArrayEffect(
          () => undefined,
          (state, chunks) => {
            const buffered = joined(carried, chunks);
            const frames: Array<Uint8Array> = [];
            let rest = buffered;
            let frame = frameOf(rest);

            while (frame !== undefined) {
              frames.push(frame[0]);
              rest = rest.subarray(frame[1]);
              frame = frameOf(rest);
            }

            carried = rest;

            // Reading a frame takes no effect of its own, so the frames of a chunk are
            // read at once rather than one effect at a time.
            return Effect.succeed([state, Arr.flatMap(frames, read)] as const);
          },
        ),
        Stream.concat(
          Effect.suspend(() =>
            carried.length === 0
              ? Effect.void
              : Effect.fail(TrajectoryError.parse("the bytes end in the middle of a frame")),
          ).pipe(Effect.as(Stream.empty), Stream.unwrap),
        ),
      );
    });
