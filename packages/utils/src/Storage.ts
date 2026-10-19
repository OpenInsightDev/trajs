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

import type { CompletedPart, S3Client } from "@aws-sdk/client-s3";
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

/** What a bucket answered where the id holds no object. */
const NotFound = 404;

/**
 * What a bucket answered where a range begins at or past the end of the object: a
 * read that takes nothing rather than a bucket that failed ({@link Bytes}).
 */
const NotSatisfiable = 416;

/**
 * How many bytes of a trajectory are held before a part of an upload is written.
 *
 * It is above the five mebibytes a bucket states for a part that is not the last one,
 * so a part is written only where the bucket takes it as one. A chunk larger than it
 * is written as a part of its own rather than cut, so a part holds the bytes that
 * arrived rather than a size stated here.
 */
const PartSize = 8 * 1024 * 1024;

/**
 * What one bucket is reached through: the client that sends to it, the name the
 * bucket is held under, and the commands of the AWS SDK read to reach it.
 */
interface Bucket {
  readonly sdk: typeof import("@aws-sdk/client-s3");
  readonly client: S3Client;
  readonly name: string;
}

/**
 * The status a bucket answered a request with, where the SDK reports the request as
 * failed: what tells a bucket that holds nothing from one that could not serve.
 *
 * A request the SDK could not make at all — a bucket that is unreachable, an endpoint
 * that does not resolve — carries no answer, so it is reported by the failure alone.
 */
const statusOf = (cause: unknown): number | undefined => {
  // SAFETY: every error the SDK reports is an object carrying the answer it reported
  // it from under `$metadata`; what carries none is not such an error, and nothing is
  // read of it rather than a status read from the wrong place.
  const answered = cause as
    | { readonly $metadata?: { readonly httpStatusCode?: number } }
    | undefined;

  return answered?.$metadata?.httpStatusCode;
};

/**
 * A request the SDK makes for a bucket, as the failure of this storage where the bucket
 * refused it or could not be reached.
 *
 * What a bucket answered with is kept as the cause of the failure, so the status of an
 * answer is read where one failure is told apart from another ({@link statusOf}).
 */
const request = <A>(
  bucket: Bucket,
  id: string,
  send: () => Promise<A>,
): Effect.Effect<A, StorageError> =>
  Effect.tryPromise({ try: send, catch: (cause) => new StorageError({ id, cause }) });

/** The head of an object: what states how long it is, and that the id holds one. */
const head = (bucket: Bucket, id: string) =>
  request(bucket, id, () =>
    bucket.client.send(new bucket.sdk.HeadObjectCommand({ Bucket: bucket.name, Key: id })),
  );

/**
 * Fails where an id is taken and the write may not write over it: the bucket is asked
 * for the object, and only an object it does not hold lets the write begin.
 */
const refuse = (bucket: Bucket, id: string): Effect.Effect<void, StorageError> =>
  head(bucket, id).pipe(
    Effect.matchEffect({
      // An id the bucket holds nothing under is free; anything else it failed with is
      // what the write failed with, since nothing says the id is untaken.
      onFailure: (error) => (statusOf(error.cause) === NotFound ? Effect.void : Effect.fail(error)),
      onSuccess: () =>
        Effect.fail(new StorageError({ id, cause: "it already holds a trajectory" })),
    }),
  );

/**
 * The bytes a bucket holds under an id: how long the object is, as the head of it, and
 * the range of it a read asks for.
 */
const bytesOf = (bucket: Bucket, id: string): Bytes<StorageError> =>
  makeBytes({
    length: head(bucket, id).pipe(Effect.map((held) => BigInt(held.ContentLength ?? 0))),
    read: (buffer, { offset = 0n, size = buffer.length } = {}) =>
      Effect.gen(function* () {
        const wanted = Math.min(size, buffer.length);

        // A read that asks for nothing reaches the bucket for nothing: what lies from
        // an offset at or past the end of an object is none of it ({@link Bytes}).
        if (wanted <= 0) {
          return 0;
        }

        const last = offset + BigInt(wanted) - 1n;

        const answered = yield* request(bucket, id, () =>
          bucket.client.send(
            new bucket.sdk.GetObjectCommand({
              Bucket: bucket.name,
              Key: id,
              Range: `bytes=${offset}-${last}`,
            }),
          ),
        ).pipe(
          // A range that begins at or past the end of the object is one the bucket
          // cannot serve, which is a read that takes nothing rather than bytes a
          // storage did not serve.
          Effect.catchIf(
            (error) => statusOf(error.cause) === NotSatisfiable,
            () => Effect.succeed(undefined),
          ),
        );

        const body = answered?.Body;

        if (body === undefined) {
          return 0;
        }

        const bytes = yield* request(bucket, id, () => body.transformToByteArray());
        const taken = Math.min(bytes.length, wanted);

        buffer.set(bytes.subarray(0, taken));

        return taken;
      }),
  });

/**
 * What a write holds while it runs: the chunks of the part being filled, and the
 * upload the parts of a multipart upload are written into.
 */
interface Uploading {
  /** The chunks of the part being filled, in the order they arrived. */
  chunks: Array<Uint8Array>;
  /** How many bytes those chunks hold. */
  buffered: number;
  /** The upload the parts belong to, once one has begun. */
  uploadId: string | undefined;
  /** The parts written so far, in the order the bucket states them. */
  parts: Array<CompletedPart>;
  /** The number the part after them is written under. */
  next: number;
  /** Whether the object has been written, so what is left has nothing to abort. */
  written: boolean;
}

/** The chunks a part holds, as one sequence of bytes. */
const joined = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  let length = 0;

  for (const chunk of chunks) {
    length += chunk.length;
  }

  const bytes = new Uint8Array(length);
  let at = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }

  return bytes;
};

/**
 * Begins the upload an id is written as: the id is checked where it may not be written
 * over, and the bucket is asked for an upload the parts are written into.
 */
const begin = (
  bucket: Bucket,
  id: string,
  write?: WriteOptions,
): Effect.Effect<string, StorageError> =>
  Effect.gen(function* () {
    if (write?.overwrite === false) {
      yield* refuse(bucket, id);
    }

    const begun = yield* request(bucket, id, () =>
      bucket.client.send(
        new bucket.sdk.CreateMultipartUploadCommand({ Bucket: bucket.name, Key: id }),
      ),
    );

    if (begun.UploadId === undefined) {
      return yield* Effect.fail(new StorageError({ id, cause: "the bucket began no upload" }));
    }

    return begun.UploadId;
  });

/**
 * Writes the chunks held as one part of the upload an id is being written as, which
 * the bucket makes an object of where the upload is completed.
 */
const part = (
  bucket: Bucket,
  id: string,
  uploadId: string,
  state: Uploading,
): Effect.Effect<void, StorageError> =>
  Effect.gen(function* () {
    const number = state.next;

    const written = yield* request(bucket, id, () =>
      bucket.client.send(
        new bucket.sdk.UploadPartCommand({
          Bucket: bucket.name,
          Key: id,
          UploadId: uploadId,
          PartNumber: number,
          Body: joined(state.chunks),
        }),
      ),
    );

    state.parts.push({ ETag: written.ETag, PartNumber: number });
    state.next = number + 1;
    state.chunks = [];
    state.buffered = 0;
  });

/**
 * Writes what is left of a trajectory and makes an object of it: an object is put
 * whole where no part was written, and the upload is completed where parts were.
 */
const finish = (
  bucket: Bucket,
  id: string,
  state: Uploading,
  write?: WriteOptions,
): Effect.Effect<void, StorageError> =>
  Effect.gen(function* () {
    const uploadId = state.uploadId;

    // A trajectory whose bytes never filled a part is one object however long it is: a
    // bucket takes an object of any size in one request, where a part of an upload has
    // to hold at least five mebibytes for the upload to be worth beginning.
    if (uploadId === undefined) {
      yield* request(bucket, id, () =>
        bucket.client.send(
          new bucket.sdk.PutObjectCommand({
            Bucket: bucket.name,
            Key: id,
            Body: joined(state.chunks),
            // The bucket keeps what it holds where the caller said the id may not be
            // written over: a put it refuses rather than one that writes over an object.
            IfNoneMatch: write?.overwrite === false ? "*" : undefined,
          }),
        ),
      );

      state.written = true;

      return;
    }

    if (state.buffered > 0) {
      yield* part(bucket, id, uploadId, state);
    }

    yield* request(bucket, id, () =>
      bucket.client.send(
        new bucket.sdk.CompleteMultipartUploadCommand({
          Bucket: bucket.name,
          Key: id,
          UploadId: uploadId,
          MultipartUpload: { Parts: state.parts },
          // Parts are written before the bucket states anything about the object, so
          // refusing to write over one is stated again where the object is made: the
          // upload is completed only where the bucket holds none under the id.
          IfNoneMatch: write?.overwrite === false ? "*" : undefined,
        }),
      ),
    );

    state.written = true;
  });

/** Aborts the upload an id was written as, where one began and no object was made of it. */
const abort = (bucket: Bucket, id: string, state: Uploading): Effect.Effect<void, StorageError> =>
  Effect.gen(function* () {
    const uploadId = state.uploadId;

    if (uploadId === undefined || state.written) {
      return;
    }

    yield* request(bucket, id, () =>
      bucket.client.send(
        new bucket.sdk.AbortMultipartUploadCommand({
          Bucket: bucket.name,
          Key: id,
          UploadId: uploadId,
        }),
      ),
    );
  });

/**
 * The sink a trajectory is written into an id through: the bytes are held as they
 * arrive, a part is written each time the part being filled holds enough, and the
 * object is made of the parts where the bytes end.
 *
 * What it holds open is an upload rather than a file, which nothing else reads, so the
 * sink states no scope of its own ({@link Storage.write}): what the write does not take
 * to an object is aborted where the sink ends, whether the bytes ended or failed.
 */
const writeInto = (
  bucket: Bucket,
  id: string,
  write?: WriteOptions,
): Sink.Sink<void, Uint8Array, never, StorageError> => {
  const state: Uploading = {
    chunks: [],
    buffered: 0,
    uploadId: undefined,
    parts: [],
    next: 1,
    written: false,
  };

  return Sink.forEachArray<Uint8Array, void, StorageError, never>((chunks) =>
    Effect.gen(function* () {
      for (const chunk of chunks) {
        // The chunk is copied rather than held: what a sink is handed may be written
        // into again before the part it falls in is written.
        state.chunks.push(chunk.slice());
        state.buffered += chunk.length;

        if (state.buffered >= PartSize) {
          // The part that fills begins the upload, so a trajectory short enough to be
          // one object never begins one.
          const uploadId = state.uploadId ?? (yield* begin(bucket, id, write));

          state.uploadId = uploadId;

          yield* part(bucket, id, uploadId, state);
        }
      }
    }),
  ).pipe(
    Sink.mapEffect(() => finish(bucket, id, state, write)),
    // What is left of an upload no object was made of is aborted, whether the bytes
    // ended, failed, or were interrupted: no part of a trajectory that failed is left
    // behind for the bucket to keep.
    Sink.onExit(() => abort(bucket, id, state)),
  );
};

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

      const bucket: Bucket = { sdk, client, name: options.bucket };

      return {
        read: (id) => Effect.succeed(bytesOf(bucket, id)),
        write: (id, write) => writeInto(bucket, id, write),
      };
    }),
  );
