/**
 * The bytes of a trajectory per id, and the place a program puts them.
 *
 * A {@link Storage} serves the bytes of a trajectory as a {@link Byte} and the sink one is written
 * through.
 * The exchange asks a storage for both, so it never holds the bytes of a trajectory itself.
 *
 * This package states a storage of a file system ({@link layerFileSystem}) and a storage of a
 * bucket ({@link layerS3}).
 * A place that could not serve a trajectory fails as a {@link StorageError}, which is told apart
 * from the failure of the trajectory.
 *
 * @stability stable
 */

import type { S3Client } from "@aws-sdk/client-s3";
import { Context, Data, Effect, FileSystem, Formatter, Layer, type Scope, Sink } from "effect";

import { type Byte, type ReadOptions } from "#/Byte.ts";
import { fileSystemStorage } from "#/internal/file-system.ts";
import { s3Storage } from "#/internal/s3.ts";

/**
 * How a trajectory is written into an id.
 *
 * **When to use**
 *
 * Use to type what {@link WriteOptions.mode} is given.
 *
 * **Details**
 *
 * - `create` begins a trajectory. What the id holds is written over, and the bytes written are the
 *   whole of it.
 * - `resume` continues a trajectory from an offset. What the id holds up to that offset stays, and
 *   the bytes written replace the rest.
 *
 * @see {@link WriteOptions} for the write it is stated on.
 * @stability stable
 * @category models
 */
export type WriteMode = "create" | "resume";

/**
 * What a trajectory is written with.
 *
 * **When to use**
 *
 * Use to state how a trajectory is written, or to type what {@link Storage.write} is given.
 *
 * **Details**
 *
 * - `overwrite` says whether a trajectory already held under the id is written over, and defaults
 *   to `true`.
 * - `mode` says whether the write begins a trajectory or continues one ({@link WriteMode}), and
 *   defaults to `create`.
 * - `offset` is how many bytes of a trajectory a `resume` keeps, and defaults to `0n`.
 *
 * A storage holds one trajectory per id, so writing one again is how a trajectory is produced a
 * second time.
 * A storage given `overwrite: false` fails with a {@link StorageError} where the id is taken.
 *
 * A `resume` keeps the bytes up to `offset` and drops the rest, so `overwrite` is read only by
 * `create`.
 *
 * **Gotchas**
 *
 * Nothing of a storage keeps a second writer out, so a `resume` is one writer's.
 * Two writes that resume one id at once interleave their bytes in it.
 * A storage declares whether it resumes at all ({@link Capabilities}).
 * One that does not fails as a {@link StorageError} whose cause is {@link UnsupportedWrite}.
 *
 * @see {@link Storage.write} for the operation it is given to.
 * @stability stable
 * @category models
 */
export interface WriteOptions {
  readonly overwrite?: boolean;
  readonly mode?: WriteMode;
  readonly offset?: bigint;
}

/**
 * What a storage declares that it serves beyond reading and writing a trajectory whole.
 *
 * **When to use**
 *
 * Use to tell, before a write is given to a storage, whether the storage continues a trajectory
 * from an offset ({@link WriteOptions.mode}).
 *
 * **Details**
 *
 * - `resume` says whether a write may state a `mode` of `resume`, and defaults to `false`.
 *
 * What a storage does not declare, it does not serve.
 * The declaration is optional, so a storage of a program compiles as it did before there was one.
 * A write that asks for what is not declared fails as a {@link StorageError} whose cause is
 * {@link UnsupportedWrite}.
 *
 * @see {@link Storage.capabilities} for where it is stated.
 * @stability stable
 * @category models
 */
export interface Capabilities {
  readonly resume?: boolean;
}

/**
 * What a trajectory is read and written through, one trajectory per id.
 *
 * **When to use**
 *
 * Use to say where trajectories are kept, such as a directory of `.trajs` files, a bucket or a map
 * in memory.
 * Use as well to type a storage of your own, which the exchange of `@trajs/core` reads and writes
 * through.
 *
 * **Details**
 *
 * - `read` serves the bytes held under an id as a {@link Byte}, and an id that holds nothing fails
 *   as a {@link StorageError}.
 * - `write` gives the sink a trajectory is written through, so its bytes are written as they are
 *   produced rather than held whole.
 * - `capabilities` states what the storage serves beyond a trajectory written whole
 *   ({@link Capabilities}), and is optional.
 *
 * An exchange carries no bytes of its own, so where those bytes are kept is the storage's to say.
 * A program that reads and writes trajectories through one is the same whichever storage is
 * provided.
 *
 * @see {@link Byte} for what a read serves.
 * @stability stable
 * @category services
 */
export interface Storage {
  /**
   * What the storage serves beyond reading and writing a trajectory whole ({@link Capabilities}).
   *
   * Nothing is stated where the storage serves what every storage serves.
   */
  readonly capabilities?: Capabilities;

  /**
   * Serves the bytes held under `id`.
   *
   * What it holds is a trajectory of the format the layer writes.
   * What is served is read at random, so a reader takes the part of it it came for.
   * It reads the head for the header and the tail for the metadata, without reading the frame the
   * parts between them are carried in.
   *
   * An id that holds nothing fails as a {@link StorageError} where its bytes are read.
   * A load of a trajectory reaches that at once, since loading reads the head of one.
   *
   * A window of a trajectory may be asked for ({@link ReadOptions}), which nothing asks for yet.
   * An exchange reads the whole of a trajectory and takes the part of it it came for, so a storage
   * may serve the whole of one.
   */
  readonly read: (
    id: string,
    options?: ReadOptions,
  ) => Effect.Effect<Byte<StorageError>, StorageError>;

  /**
   * The sink a trajectory is written into `id` through.
   *
   * The bytes arrive in the order they are produced.
   * What holds them is held open while the sink runs, so the sink is run in a scope.
   * A trajectory is written where it is produced, not once it has ended.
   *
   * A write continues a trajectory where the options say so ({@link WriteOptions}).
   * What the id holds up to the offset stays, and the bytes of the sink replace the rest.
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
 * Use to require a storage of a program, so the exchange of `@trajs/core` reads and writes
 * trajectories through it.
 * A program that keeps its trajectories as files provides {@link layerFileSystem}.
 * One that keeps them somewhere else, such as a bucket, provides a layer of its own.
 *
 * **Details**
 *
 * What a storage is of is a place, so a layer of it is provided at the composition root of a
 * program rather than by the exchange.
 * The exchange reaches the bytes of a trajectory through the service alone.
 *
 * @see {@link Storage} for what the service gives.
 * @see {@link layerFileSystem} for the storage this package ships.
 * @stability stable
 * @category tags
 */
export const Storage: Context.Service<Storage, Storage> = Context.Service<Storage, Storage>()(
  "trajs/utils/Storage",
);

/**
 * A read of bytes that failed, or a place that could not be written to.
 *
 * **When to use**
 *
 * Use to tell the failure of a storage apart from the failure of a trajectory.
 * A storage that is missing, that refused, or that was cut short fails as this error.
 * Bytes that do not hold what a trajectory is made of fail as the trajectory's own error.
 *
 * **Details**
 *
 * `id` names the trajectory the storage was asked about, the one read or the one written.
 * `cause` is what the storage failed with, as it reported it, such as the failure of a file system
 * or the message a bucket answered with.
 *
 * @see {@link Storage} for what a trajectory is read and written through.
 * @stability stable
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
 * What a storage that cannot write a trajectory the way the write asks fails with.
 *
 * **When to use**
 *
 * Use to tell a storage that does not serve a write from one that tried and failed.
 * Use as well to tell a caller to write a trajectory another way rather than to attempt the write
 * again.
 *
 * **Details**
 *
 * - `mode` is the write the storage does not serve.
 * - `offset` is the offset the write was given.
 *
 * It is the `cause` of a {@link StorageError}.
 * The place holds a trajectory whole rather than bytes it is cut at, so it serves no write that
 * continues one from an offset.
 * What a storage serves is declared before a write reaches it ({@link Capabilities}).
 *
 * @see {@link Storage.capabilities} for what a storage declares.
 * @stability stable
 * @category errors
 */
export class UnsupportedWrite extends Data.TaggedError("UnsupportedWrite")<{
  mode: WriteMode;
  offset: bigint;
}> {
  override get message(): string {
    return `The storage does not write a trajectory in mode '${this.mode}' from offset ${this.offset}`;
  }
}

/**
 * One trajectory per file of a file system, named by its path.
 *
 * **When to use**
 *
 * Use when a program keeps its trajectories as files, which is what a `.trajs` file is.
 * A program with a file system wants this, whatever platform that file system is of.
 *
 * **Details**
 *
 * `id` is the path of the file a trajectory is kept in.
 * Nothing else of the id is read as a name of anything.
 * A trajectory is loaded from the file it names and saved into it, and a path that holds nothing
 * fails as a {@link StorageError}.
 *
 * What a read serves holds no file open.
 * A read opens the file, takes what it was asked for and closes it again.
 * It needs no scope of its own, so {@link Storage.read} gives out bytes read at random.
 * A trajectory too large to hold is read where the parts of it are wanted ({@link Byte}).
 *
 * A trajectory is written through the file system's own sink, so its bytes are written as they are
 * produced.
 * `overwrite` states whether a file that is already there is written over ({@link WriteOptions}).
 * `overwrite: false` fails where the path is taken rather than putting one trajectory where another
 * was.
 *
 * A write continues a file where the options say so ({@link WriteOptions.mode}).
 * The file is opened, cut at the offset, and written from there, so the bytes before the offset
 * stay.
 * An offset past the end of the file fails as a {@link StorageError} rather than leaving a gap.
 * Nothing of the file system keeps a second writer out, so a resumed write is the file's only one.
 *
 * @see {@link Storage} for the service this provides.
 * @stability stable
 * @category layers
 */
export const layerFileSystem: Layer.Layer<Storage, never, FileSystem.FileSystem> = Layer.effect(
  Storage,
  fileSystemStorage,
);

/**
 * What a bucket states about the object a request is made for.
 *
 * **When to use**
 *
 * Use where the layer is built ({@link layerS3}) to state which bucket keeps the trajectories.
 * Where the bucket is and how a request to it is signed is stated of the client rather than here.
 *
 * **Details**
 *
 * - `bucket` is the bucket a trajectory is kept in.
 *
 * An id is the key of the object it is written as, so nothing of an id but the key is read.
 *
 * @see {@link layerS3} for the layer this is given to.
 * @stability stable
 * @category models
 */
export interface S3Options {
  readonly bucket: string;
}

/**
 * One trajectory per object of a bucket, named by its key.
 *
 * **When to use**
 *
 * Use when a program keeps its trajectories in a bucket, such as S3 or a store that speaks it.
 * Use with a client of the AWS SDK to reach it.
 * The client states where the bucket is and how a request to it is signed.
 * A bucket of your own is reached through a client of your own ({@link S3Options}).
 * The client is the program's rather than this layer's, which neither builds one nor closes it.
 *
 * **Details**
 *
 * `id` is the key of the object a trajectory is kept in.
 * Nothing else of the id is read as a name of anything.
 * A trajectory is loaded from the object it names and saved into it, and a key that holds nothing
 * fails as a {@link StorageError}.
 *
 * What a read serves is read at random.
 * The length of an object is read as the head of it, and a read asks for a range of it.
 * A trajectory's head is read for the header and its tail for the metadata, without the frame
 * between them.
 * A range that begins at or past the end of the object is a read that takes nothing ({@link Byte}).
 * A bucket states such a range as one it cannot serve.
 *
 * A trajectory is written in parts.
 * The bytes are held as they arrive, and a part is written once it holds eight mebibytes.
 * The bucket makes an object of the parts where the sink ends.
 * A trajectory whose bytes never hold that much is put as one object instead.
 * A bucket takes an object of any size in one request.
 * An upload that ended before its object was written is aborted where the sink fails, is
 * interrupted, or is cut short.
 * Nothing of a trajectory that failed is left for the bucket to keep.
 *
 * `overwrite: false` is stated to the bucket rather than checked here alone.
 * An object is put, and an upload is completed, only where the bucket holds none under the id.
 * A write that another writer reached first fails as a {@link StorageError}.
 *
 * A bucket holds an object whole, so a write that continues a trajectory from an offset is not
 * served ({@link WriteOptions.mode}).
 * It fails as a {@link StorageError} whose cause is {@link UnsupportedWrite}, rather than writing
 * a trajectory twice.
 *
 * The commands of the AWS SDK are read when the layer is built rather than when this module is
 * imported.
 * A program that keeps its trajectories elsewhere carries no part of the SDK.
 *
 * @see {@link Storage} for the service this provides.
 * @see {@link layerFileSystem} for the storage this package ships for a file system.
 * @stability stable
 * @category layers
 */
export const layerS3 = (client: S3Client, options: S3Options): Layer.Layer<Storage> =>
  Layer.effect(
    Storage,
    Effect.gen(function* () {
      const sdk = yield* Effect.promise(() => import("@aws-sdk/client-s3"));

      return s3Storage(sdk, client, options.bucket);
    }),
  );
