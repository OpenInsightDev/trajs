/**
 * What a program keeps its trajectories in: the bytes of a trajectory per id, the
 * place to put them, and the failure of a place that could not serve one.
 *
 * What a trajectory is read and written through is a {@link Storage}, so where
 * trajectories are kept is a storage's to say rather than the format's: what a
 * storage serves a trajectory as is a {@link Bytes}, and what it takes one through
 * is a sink, so the exchange never holds the bytes of a trajectory itself. A storage
 * is of a place — a directory of files, a bucket, a map in memory — and what this
 * package states is a storage of a file system ({@link layerFileSystem}), which
 * keeps a trajectory in the file it is named by over the file system any platform
 * provides, and a storage of a bucket ({@link layerS3}), which keeps it in the object
 * it names in a bucket of S3 reached with a client of the AWS SDK. What a place could
 * not serve is a {@link StorageError}, told apart from the failure of the trajectory
 * it was asked for.
 */

import type { S3Client } from "@aws-sdk/client-s3";
import { Context, Data, Effect, FileSystem, Formatter, Layer, type Scope, Sink } from "effect";

import { type Bytes, type ReadOptions } from "#/Bytes.ts";
import { fileSystemStorage } from "#/internal/file-system.ts";
import { s3Storage } from "#/internal/s3.ts";

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
 *   the header and its tail for the metadata, without reading the frame the
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

    return fileSystemStorage(fs);
  }),
);

/**
 * What a bucket states about the object a request was made for.
 *
 * **When to use**
 *
 * Use where the layer is built ({@link layerS3}) to state which bucket keeps the
 * trajectories, and nothing else of it: where the bucket is and how a request to it
 * is signed — its region, its endpoint, the credentials it is reached with — is
 * stated of the client rather than here.
 *
 * **Details**
 *
 * - `bucket` is the bucket a trajectory is kept in, and an id is the key of the
 *   object it is written as: ids name keys rather than paths, so nothing of an id
 *   but the key is read.
 *
 * @see {@link layerS3} for the layer this is given to.
 * @category models
 */
export interface S3Options {
  readonly bucket: string;
}

/**
 * The storage of a bucket: one trajectory per object, named by its key.
 *
 * **When to use**
 *
 * Use when a program keeps its trajectories in a bucket — S3, or a store that speaks
 * it — rather than on its file system, and holds a client of the AWS SDK to reach it
 * with: where the bucket is and how a request to it is signed (region, endpoint,
 * credentials) is stated of the client, so a bucket of your own is reached through a
 * client of your own ({@link S3Options}). The client is the program's rather than this
 * layer's, which neither builds one nor closes the one it is given.
 *
 * **Details**
 *
 * `id` is the key of the object a trajectory is kept in, and nothing else of the id
 * is read as a name of anything: a trajectory is loaded from the object it names and
 * saved into it, and a key that holds nothing fails as a {@link StorageError}.
 *
 * What a read serves is read at random: the length of an object is read as the head of
 * it, and what a read asks for is a range of it, so the head of a trajectory is read
 * for the header and its tail for the metadata without the frame between them being
 * read. A range that begins at or past the end of the object is a read that takes
 * nothing ({@link Bytes}) rather than a storage that failed, which is what a bucket
 * states of such a range.
 *
 * A trajectory is written in parts: the bytes are held as they arrive, a part is
 * written as soon as it holds eight mebibytes, and the bucket makes an object of the
 * parts where the sink ends. A trajectory whose bytes never hold that much is put as
 * one object instead, in a single request, since a bucket takes an object of any size
 * that way where a part has to hold five mebibytes. An upload that ended before its
 * object was written is aborted where the sink fails, is interrupted, or is cut short,
 * so nothing of a trajectory that failed is left for the bucket to keep.
 *
 * `overwrite: false` is stated to the bucket rather than checked here alone: an object
 * is put, and an upload is completed, only where the bucket holds none under the id,
 * so a write that another writer reached first fails as a {@link StorageError} rather
 * than putting one trajectory where another was.
 *
 * The commands of the AWS SDK are read when the layer is built rather than when this
 * module is imported, so a program that keeps its trajectories elsewhere carries no
 * part of the SDK.
 *
 * @see {@link Storage} for the service this provides.
 * @see {@link layerFileSystem} for the storage this package ships for a file system.
 * @category layers
 */
export const layerS3 = (client: S3Client, options: S3Options): Layer.Layer<Storage> =>
  Layer.effect(
    Storage,
    Effect.gen(function* () {
      // The SDK is read where the layer is built rather than where this module is
      // imported: the commands of a bucket are large, and a program that keeps its
      // trajectories elsewhere asks for none of them.
      const sdk = yield* Effect.promise(() => import("@aws-sdk/client-s3"));

      return s3Storage(sdk, client, options.bucket);
    }),
  );
