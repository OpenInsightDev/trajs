/**
 * The frames a body is carried in: where one ends in a stream of bytes, and reading a body
 * as the values of one schema they carry.
 *
 * A frame states the length of everything after it before it states anything else of it
 * ({@link SchemaBinary}), so a body is cut into frames by their own lengths rather than
 * handed to one parser: a frame the schema does not read — a metric part of a metric a kit
 * names none of, say — is stepped over, and the frames after it are read as if it were not
 * there. That is what lets a trajectory one kit wrote be read under another.
 */

import { Schema, Stream } from "effect";
import { SchemaBinary } from "effect/encoding";

import { TrajectoryError } from "#/TrajectoryError.ts";

/** How many bytes state the length of a frame at most: the width of the largest one. */
const LengthPrefixBytes = 10;

/**
 * How many bytes the first whole frame of `bytes` takes, or `undefined` where they hold
 * none.
 *
 * A frame states the length of everything after its prefix before it states anything else
 * of it, so where one ends is read off the bytes rather than off the value it carries — the
 * one thing of `SchemaBinary` assumed here: a change to it moves those boundaries without
 * failing, and shows up as values missing from a body.
 */
const frameLength = (bytes: Uint8Array): number | undefined => {
  let scale = 1;
  let length = 0;

  for (let at = 0; at < LengthPrefixBytes && at < bytes.length; at += 1) {
    const byte = bytes[at]!;

    length += (byte & 0x7f) * scale;

    if ((byte & 0x80) === 0) {
      const end = at + 1 + length;

      return end > bytes.length ? undefined : end;
    }

    scale *= 128;
  }

  // A length a frame never states is no frame at all, so there is no end of one to step
  // over: such bytes are what the body ends in the middle of.
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
 * Reads the frames of a body as the values the schema given states, whatever stream the
 * bytes arrive in.
 *
 * - A frame is one value, and the frames come out in the order they were written, whether
 *   a frame shares a chunk with the frames around it or spans several.
 * - A frame the schema does not read is stepped over, and the frames after it are read as
 *   if it were not there.
 * - A body that ends in the middle of a frame fails as a {@link TrajectoryError} rather
 *   than losing the value silently.
 */
export const readFrames =
  <S extends Schema.Constraint>(schema: S) =>
  <E, R>(body: Stream.Stream<Uint8Array, E, R>): Stream.Stream<S["Type"], E | TrajectoryError, R> =>
    Stream.suspend(() => {
      // SAFETY: only the reading of a frame is taken of the codec, and a part schema reads
      // as the plain schemas it is rebuilt from state it, which take no service; the
      // services a schema states are those of writing it, which nothing here does.
      const decode = Schema.decodeUnknownSync(
        SchemaBinary.toCodec(schema) as Schema.Codec<
          S["Type"],
          Uint8Array<ArrayBuffer>,
          never,
          never
        >,
      );

      // A reading starts afresh, so the bytes a chunk ended in the middle of a frame with
      // are held per reading rather than by the combinator.
      let carried: Uint8Array = new Uint8Array();

      return body.pipe(
        // Not `Stream.mapArray`: a chunk that holds no whole frame yields nothing.
        Stream.mapAccumArray(
          () => undefined,
          (state, chunks) => {
            let rest = joined(carried, chunks);
            const values: Array<S["Type"]> = [];
            let size = frameLength(rest);

            while (size !== undefined) {
              const frame = rest.subarray(0, size);

              rest = rest.subarray(size);

              // A frame the schema does not read states no value of the body; a schema that
              // fails any other way is a defect of its own rather than one of the bytes.
              try {
                values.push(decode(frame));
              } catch (error) {
                if (!Schema.isSchemaError(error)) throw error;
              }

              size = frameLength(rest);
            }

            carried = rest;

            return [state, values] as const;
          },
        ),
        Stream.concat(
          Stream.suspend(() =>
            carried.length === 0
              ? Stream.empty
              : Stream.fail(TrajectoryError.parse("the bytes end in the middle of a frame")),
          ),
        ),
      );
    });
