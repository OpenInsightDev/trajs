import { Effect, Option, Schema, Stream } from "effect";
import { SchemaBinary } from "effect/encoding";

import { TrajectoryError } from "#/TrajectoryError.ts";

const LengthPrefixBytes = 10;

// The end is read from the length prefix, not from the decoded value.
// A prefix change moves those ends and drops values, with no failure.
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

  return undefined;
};

export const splitFrames = (bytes: Uint8Array) => {
  const frames: Array<Uint8Array> = [];
  let offset = 0;
  let size = frameLength(bytes);

  while (size !== undefined) {
    frames.push(bytes.subarray(offset, offset + size));

    offset += size;
    size = frameLength(bytes.subarray(offset));
  }

  return { frames, rest: bytes.subarray(offset) };
};

export const joined = (rest: Uint8Array, chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  if (rest.length === 0 && chunks.length === 1) {
    return chunks[0]!;
  }

  const bytes = new Uint8Array(
    rest.length + chunks.reduce((size, chunk) => size + chunk.length, 0),
  );

  bytes.set(rest);

  let at = rest.length;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

export const readFrames =
  <S extends Schema.Constraint>(schema: S) =>
  <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<S["Type"], E | TrajectoryError, R | S["DecodingServices"]> =>
    Stream.suspend(() => {
      const decode = Schema.decodeUnknownEffect(SchemaBinary.toCodec(schema));

      let carried: Uint8Array = new Uint8Array();

      return bytes.pipe(
        // Not `Stream.mapArray`: a chunk with no whole frame yields nothing.
        Stream.mapAccumArrayEffect(
          () => undefined,
          (_state, chunks) =>
            Effect.gen(function* () {
              const { frames, rest } = splitFrames(joined(carried, chunks));
              const values: Array<S["Type"]> = [];

              for (const frame of frames) {
                // A frame this schema does not decode is skipped.
                // A defect in the schema still fails the read.
                const decoded = yield* decode(frame).pipe(Effect.option);

                if (Option.isSome(decoded)) {
                  values.push(decoded.value);
                }
              }

              carried = rest;

              return [undefined, values] as const;
            }),
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
