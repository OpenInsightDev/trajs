/**
 * What a program keeps its trajectories in: the bytes of a trajectory per id, the
 * place to put them, and the failure of a place that could not serve one.
 *
 * What a trajectory is read and written through is a {@link Storage}, so where
 * trajectories are kept is a storage's to say rather than the format's: what a
 * storage serves a trajectory as is a {@link Bytes}, and what it takes one through
 * is a sink, so the exchange never holds the bytes of a trajectory itself. A storage
 * is of a place — a directory of files, a bucket, a map in memory — and the one
 * this package states is {@link layerFileSystem}, which keeps a trajectory in the
 * file it is named by over the file system any platform provides and serves it as
 * {@link fileBytes}. What a place could not serve is a {@link StorageError}, told
 * apart from the failure of the trajectory it was asked for.
 */

import { Context, Data, Effect, FileSystem, Formatter, Layer, type Scope, Sink } from "effect";

import { type Bytes, makeBytes, type ReadOptions } from "#/Bytes.ts";

/**
 * What a trajectory is written with.
 *
 * **When to use**
 *
 * Use to type what {@link Storage.write} is given, or to state the options where
 * a trajectory is written.
 *
 * **Details**
 *
 * - `overwrite` says whether a trajectory already held under the id is written
 *   over, and defaults to `true`: a storage holds one trajectory per id, and
 *   writing one again is how a trajectory is produced a second time. A storage
 *   given `false` fails with a {@link StorageError} where the id is taken, rather
 *   than putting one trajectory where another was.
 *
 * @see {@link Storage.write} for the operation it is given to.
 */
export interface WriteOptions {
  readonly overwrite?: boolean;
}

/**
 * What a program keeps its trajectories in: the bytes of a trajectory per id, and
 * the place to put them.
 *
 * **When to use**
 *
 * Use to say where trajectories are kept — a directory of `.trajs` files, a bucket,
 * a map in memory — and provide the layer to `Exchange.layer`, which reads and
 * writes trajectories through it.
 *
 * **Details**
 *
 * - `read` serves the bytes held under an id as a {@link Bytes}, which what reads
 *   them takes what it needs from: the exchange reads the head of a trajectory for
 *   the header line and its tail for the metadata, without reading the frame the
 *   parts between them are carried in. An id that holds nothing fails as a
 *   {@link StorageError}.
 * - `write` gives the sink a trajectory of that id is written through, so its
 *   bytes are written as they are produced rather than held whole. What such a
 *   sink writes into — a file, a socket — is held open for as long as it is run,
 *   so it is run in a scope; `Exchange.Service.save` runs it in the scope of the
 *   save itself.
 *
 * An exchange carries no bytes of its own: it asks the storage it was provided
 * for the bytes of a trajectory and for the place to write one, so where those
 * bytes are kept is the storage's to say, and the programs that read and write
 * trajectories through an exchange are the same whichever storage is provided.
 *
 * @see {@link Bytes} for what a read serves.
 */
export interface Storage {
  /**
   * Serves the bytes held under `id`.
   *
   * What it holds is a trajectory of the format the layer writes, and what it
   * serves is read at random rather than at once, so a reader takes the part of
   * it it came for: the head for what the trajectory states of itself, and the tail
   * for what it is named by. An id that holds nothing fails as a
   * {@link StorageError} where its bytes are read, which a load of a trajectory
   * reaches at once, since loading reads the head of one.
   *
   * A window of a trajectory may be asked for ({@link ReadOptions}), which nothing
   * asks for yet: an exchange reads the whole of a trajectory and takes the part of
   * it it came for, so a storage may serve the whole of one.
   */
  readonly read: (
    id: string,
    options?: ReadOptions,
  ) => Effect.Effect<Bytes<StorageError>, StorageError>;

  /**
   * The sink a trajectory is written into `id` through.
   *
   * The bytes arrive in the order they are produced, and what holds them is held
   * for as long as the sink is run — so the sink is run in a scope, and the
   * trajectory is written where it is produced rather than once it has ended.
   */
  readonly write: (
    id: string,
    options?: WriteOptions,
  ) => Sink.Sink<void, Uint8Array, never, StorageError, Scope.Scope>;
}

/**
 * The service a storage is provided through.
 *
 * **When to use**
 *
 * Use to require a storage of a program, and `Exchange.layer` to read and write
 * trajectories through it. A program that keeps its trajectories as files provides
 * {@link layerFileSystem}, and one that keeps them somewhere else — a bucket, a
 * store in a page — provides a layer of its own.
 *
 * **Details**
 *
 * What a storage is of is a place: a directory of files, a bucket, a map in
 * memory. So a layer of it is provided at the composition root of a program
 * rather than by the exchange, which reaches the bytes of a trajectory through
 * the service alone.
 *
 * @see {@link Storage} for what the service gives.
 * @see {@link layerFileSystem} for the storage this package ships.
 */
export const Storage: Context.Service<Storage, Storage> = Context.Service<Storage, Storage>()(
  "trajs/utils/Storage",
);

/**
 * What a storage failed with: bytes that could not be read, or a place they could
 * not be written to.
 *
 * **When to use**
 *
 * Use to tell the failure of a storage apart from the failure of a trajectory: a
 * storage that is missing, that refused, or that was cut short fails as this error,
 * where bytes that do not hold what a trajectory is made of fail as the trajectory's
 * own error.
 *
 * **Details**
 *
 * `id` names the trajectory the storage was asked about — the one whose bytes could
 * not be read, or the one that could not be written — and `cause` is what the
 * storage failed with, as it reported it: the failure of a file system, the message
 * a bucket answered with, or the description of what a byte sequence did not hold.
 *
 * @see {@link Storage} for what a trajectory is read and written through.
 * @category errors
 */
export class StorageError extends Data.TaggedError("StorageError")<{
  id: string;
  cause: unknown;
}> {
  override get message(): string {
    return `Failed to read or write '${this.id}': ${Formatter.format(this.cause)}`;
  }
}

/**
 * The storage this package ships: one trajectory per file, named by its path.
 *
 * **When to use**
 *
 * Use when a program keeps its trajectories as files — what a `.trajs` file is —
 * which is what a program with a file system wants, whatever platform that file
 * system is of.
 *
 * **Details**
 *
 * `id` is the path of the file a trajectory is kept in, and nothing else of the id
 * is read as a name of anything: a trajectory is loaded from the file it names and
 * saved into it, and a path that holds nothing fails as a {@link StorageError}.
 *
 * What a read serves holds no file open: a read opens the file, takes what it was
 * asked for and closes it again, so what {@link Storage.read} gives out is read at
 * random without a scope of its own, and a trajectory too large to hold is read where
 * the parts of it are wanted ({@link Bytes}).
 *
 * A trajectory is written through the file system's own sink, so its bytes are
 * written as they are produced; `overwrite` states whether a file that is already
 * there is written over ({@link WriteOptions}), which defaults to being:
 * `overwrite: false` fails where the path is taken rather than putting one trajectory
 * where another was.
 *
 * @see {@link Storage} for the service this provides.
 * @category layers
 */
export const layerFileSystem: Layer.Layer<Storage, never, FileSystem.FileSystem> = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const fileBytes = (path: string): Bytes<StorageError> =>
      makeBytes({
        length: fs.stat(path).pipe(
          Effect.map((info) => info.size),
          Effect.mapError((cause) => new StorageError({ id: path, cause })),
        ),
        read: (buffer, { offset = 0n } = {}) =>
          Effect.gen(function* () {
            const file = yield* fs.open(path, { flag: "r" });

            if (offset !== 0n) {
              yield* file.seek(offset, "start");
            }

            return yield* file.read(buffer);
          }).pipe(
            Effect.scoped,
            Effect.mapError((cause) => new StorageError({ id: path, cause })),
          ),
      });

    return {
      read: (id) => Effect.succeed(fileBytes(id)),
      write: (id, options) =>
        fs
          .sink(id, { flag: options?.overwrite === false ? "wx" : "w" })
          .pipe(Sink.mapError((cause) => new StorageError({ id, cause }))),
    };
  }),
);
