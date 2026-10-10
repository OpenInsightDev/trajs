/**
 * The storage formats a `.trajs` file can be written in.
 *
 * A recording is a stream of records: the header first, and then the parts of
 * the trajectory. A storage format is how those records become the bytes of a
 * file, and {@link jsonl} and {@link bson} are the two this package ships — the
 * newline-delimited JSON that `.trajs` names, and the documents of `.trajs.bson`.
 * {@link resolve} reads the format off the end of a key, so a file states it in
 * its own name, and any other value implementing {@link Format} reads and writes
 * a recording just as well.
 */

import { Option, Stream } from "effect";
import { Ndjson } from "effect/encoding";
import * as Bson from "#/internal/bson.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A storage format for a `.trajs` file.
 *
 * **When to use**
 *
 * Use to read or write a recording in a format other than the ones that ship
 * with this package, or to name one of the shipped formats explicitly.
 *
 * **Details**
 *
 * A format holds two directions. {@link Format.encode} writes a stream of
 * records as the bytes of a file, and {@link Format.decode} reads records back
 * out of those bytes. Each reports the failures of the format itself — a record
 * that cannot be written, or bytes that cannot be read — as a
 * {@link TrajectoryError}, so a malformed recording fails the same way however it
 * is stored. Failures the format is handed, such as a file that cannot be read,
 * pass through as they are.
 *
 * A format also holds the file extensions it is recognized by, the first of
 * which names the files it writes.
 *
 * @see {@link jsonl} and {@link bson} for the shipped formats.
 * @see {@link resolve} for reading a format off a key.
 * @category models
 */
export interface Format {
  /**
   * File extensions this format reads and writes, the first being the one that
   * names a new file.
   */
  readonly extensions: readonly string[];
  /**
   * Writes the records of a recording as the bytes of a file.
   */
  readonly encode: <E, R>(
    records: Stream.Stream<unknown, E, R>,
  ) => Stream.Stream<Uint8Array, E | TrajectoryError, R>;
  /**
   * Reads the records of a recording out of the bytes of a file.
   */
  readonly decode: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<unknown, E | TrajectoryError, R>;
}

/**
 * Newline-delimited JSON, the storage format of a plain `.trajs` file.
 *
 * **When to use**
 *
 * Use to store a recording that stays readable and diffable.
 *
 * **Details**
 *
 * Each record is one line of JSON, so the file is text and the header is its
 * first line. It is the format a `.trajs` key names, and a file that names it
 * explicitly is a `.trajs.jsonl`.
 *
 * @see {@link bson} for the binary format of a `.trajs.bson` file.
 * @category models
 */
export const jsonl: Format = {
  extensions: [".trajs", ".trajs.jsonl"],
  encode: <E, R>(
    records: Stream.Stream<unknown, E, R>,
  ): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
    records.pipe(
      Stream.pipeThroughChannel(Ndjson.encode()),
      Stream.catchTag("NdjsonError", (cause) => Stream.fail(TrajectoryError.parse(cause))),
    ),
  decode: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<unknown, E | TrajectoryError, R> =>
    bytes.pipe(
      Stream.pipeThroughChannel(Ndjson.decode({ ignoreEmptyLines: true })),
      Stream.catchTag("NdjsonError", (cause) => Stream.fail(TrajectoryError.parse(cause))),
    ),
};

/**
 * Concatenated BSON documents, the storage format of a `.trajs.bson` file.
 *
 * **When to use**
 *
 * Use to store a recording for a tool that reads BSON, or where the records are
 * read by a machine rather than by a person.
 *
 * **Details**
 *
 * Each record is one BSON document, and the documents are written back to back
 * with nothing between them, because each document states its own size. The
 * header is the first document. The file is binary, so it is neither readable nor
 * diffable as text.
 *
 * @see {@link jsonl} for the text format of a plain `.trajs` file.
 * @category models
 */
export const bson: Format = {
  extensions: [".trajs.bson"],
  encode: <E, R>(
    records: Stream.Stream<unknown, E, R>,
  ): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
    records.pipe(
      Stream.pipeThroughChannel(Bson.encode()),
      Stream.catchTag("BsonError", (cause) => Stream.fail(TrajectoryError.parse(cause))),
    ),
  decode: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ): Stream.Stream<unknown, E | TrajectoryError, R> =>
    bytes.pipe(
      Stream.pipeThroughChannel(Bson.decode()),
      Stream.catchTag("BsonError", (cause) => Stream.fail(TrajectoryError.parse(cause))),
    ),
};

const shipped: readonly Format[] = [jsonl, bson];

/**
 * Reads the storage format a key names.
 *
 * **When to use**
 *
 * Use to tell how a file will be read, or to check that a key names a format
 * before writing it.
 *
 * **Details**
 *
 * The format is the one whose extension the key ends with. When several match,
 * the longest one wins, so a format that extends another's extension is never
 * shadowed by it. A key that ends with none of them names no format.
 *
 * @see {@link Format} for the extensions a format is recognized by.
 * @category decoding
 */
export const resolve = (key: string): Option.Option<Format> => {
  let resolved = Option.none<Format>();
  let longest = 0;

  for (const format of shipped) {
    for (const extension of format.extensions) {
      if (extension.length > longest && key.endsWith(extension)) {
        resolved = Option.some(format);
        longest = extension.length;
      }
    }
  }

  return resolved;
};
