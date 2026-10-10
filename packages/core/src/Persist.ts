/**
 * Reads and writes trajectories as JSON Lines.
 *
 * A recorded trajectory is a `.trajs` file. Each line is one JSON record: the
 * first is a header carrying the trajectory's non-stream fields (the metadata,
 * including the specification version, and the serialized toolkit and extension
 * kit), and the rest are the parts of the trajectory, discriminated by their
 * `_tag`.
 *
 * The header is peeled off the stream and read on its own rather than described
 * as a part, because it is not one. It comes first because a decoder needs a
 * tool's schemas before it can decode that tool's parts.
 */

import { Effect, Option, Schema, Sink, Stream } from "effect";
import { Tool, Toolkit } from "effect/ai";
import type * as Extension from "#/Extension.ts";
import * as Extensionkit from "#/Extensionkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";
import * as TrajectoryToolkit from "#/Toolkit.ts";
import { StreamReader } from "#/internal/stream-reader.ts";
import { StreamWriter } from "#/internal/stream-writer.ts";

/**
 * The header has no `version` field of its own: the specification version is
 * `metadata.version`, so a recording states it the same way whether it is read
 * from a file or constructed in memory. The two kits are read as records of
 * unknown values, because a reader needs their identifiers, not their schemas:
 * the toolkit starts empty and the extension kit is not held at all, so the
 * parts are read unconstrained.
 */
const Header = Schema.Struct({
  metadata: Trajectory.Metadata,
  toolkit: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  extkit: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

/**
 * Encodes a trajectory as the records of a `.trajs` file.
 *
 * **When to use**
 *
 * Use to store a recorded trajectory, or to send its records to a writer.
 *
 * **Details**
 *
 * The first record is the header, followed by one record per part, encoded with
 * the toolkit and extension kit the trajectory was recorded with. Records are
 * plain JSON values, ready for a newline-delimited JSON writer to serialize.
 *
 * @see {@link write} for storing the records with the stream writer.
 * @category encoding
 */
export const encode = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
>(
  trajectory: Trajectory.Trajectory<Tools, Exts>,
): Stream.Stream<unknown, TrajectoryError, Tool.ResultEncodingServices<Tools[keyof Tools]>> => {
  const encodePart = Schema.encodeEffect(Trajectory.Part(trajectory.toolkit, trajectory.extkit));

  const header = {
    metadata: trajectory.metadata,
    toolkit: TrajectoryToolkit.encode(trajectory.toolkit),
    extkit: Extensionkit.encode(trajectory.extkit),
  };

  return Stream.concat(
    Stream.make(header),
    trajectory.pipe(
      Stream.mapEffect((part) =>
        encodePart(part).pipe(Effect.mapError(TrajectoryError.encodeTool(trajectory.toolkit))),
      ),
    ),
  );
};

/**
 * Decodes a trajectory from the records of a `.trajs` file.
 *
 * **When to use**
 *
 * Use to load a recorded trajectory, or to read the records another producer
 * wrote.
 *
 * **Details**
 *
 * The first record is peeled off the stream and read as the header; the remaining
 * records stay lazy and are decoded as parts. A header without metadata, or with
 * metadata that does not state its `version`, is a parse failure rather than a
 * trajectory of unknown vintage. The returned trajectory's toolkit is empty and
 * its extension kit is not held, because tool and extension parts are read
 * unconstrained: bind them to their schemas with `Toolkit.toolkits` and
 * `Extensionkit.extkits` when they are available.
 *
 * The parts are read from the same source as the header, so the returned
 * trajectory is only valid within the scope the effect runs in: consume it there.
 *
 * @see {@link read} for reading the records with the stream reader.
 * @category decoding
 */
export const decode = Effect.fn("Persist.decode")(function* <E, R>(
  records: Stream.Stream<unknown, E, R>,
) {
  const [header, rest] = yield* Stream.peel(records, Sink.head<unknown>());

  if (Option.isNone(header)) {
    return yield* Effect.fail(TrajectoryError.parse("missing trajectory header"));
  }

  const decodedHeader = yield* Schema.decodeUnknownEffect(Header)(header.value).pipe(
    Effect.mapError(TrajectoryError.parse),
  );

  const decodePart = Schema.decodeUnknownEffect(Trajectory.Part(Toolkit.empty, Extensionkit.empty));

  return Trajectory.make(
    rest.pipe(
      Stream.mapEffect((record) => decodePart(record).pipe(Effect.mapError(TrajectoryError.parse))),
    ),
    decodedHeader.metadata,
  );
});

/**
 * Writes a trajectory to a `.trajs` file.
 *
 * **When to use**
 *
 * Use to store a recorded trajectory on a file system.
 *
 * **Details**
 *
 * The trajectory's records are written as newline-delimited JSON, the header
 * first.
 *
 * @category encoding
 */
export const write =
  <Tools extends Record<string, Tool.Any>, Exts extends Record<string, Extension.Any>>(
    trajectory: Trajectory.Trajectory<Tools, Exts>,
  ) =>
  (key: string) =>
    Effect.gen(function* () {
      const writer = yield* StreamWriter;

      yield* writer.write(Schema.Unknown)(key, encode(trajectory));
    }).pipe(Effect.provide(StreamWriter.layer), Effect.withSpan("Persist.write"));

/**
 * Reads a trajectory from a `.trajs` file.
 *
 * **When to use**
 *
 * Use to load a recorded trajectory from a file system.
 *
 * **Details**
 *
 * The file is read as newline-delimited JSON. Parts stay lazy, so the returned
 * trajectory is only valid within the scope the effect runs in: consume it
 * there.
 *
 * @category decoding
 */
export const read = (key: string) =>
  Effect.gen(function* () {
    const reader = yield* StreamReader;

    return yield* decode(reader.read(Schema.Unknown)(key));
  }).pipe(Effect.provide(StreamReader.layer), Effect.withSpan("Persist.read"));
