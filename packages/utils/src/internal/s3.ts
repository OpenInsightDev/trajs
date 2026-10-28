/**
 * The storage of a bucket: one trajectory per object, named by its key, as
 * `Storage.layerS3` provides it.
 */

import type { CompletedPart, S3Client } from "@aws-sdk/client-s3";
import { Effect, Sink } from "effect";

import { type Byte, makeByte } from "#/Byte.ts";
import { type Storage, StorageError, UnsupportedWrite, type WriteOptions } from "#/Storage.ts";

/** What a bucket answered where the id holds no object. */
const NotFound = 404;

/**
 * What a bucket answered where a range begins at or past the end of the object.
 *
 * It is a read that takes nothing, rather than a bucket that failed.
 */
const NotSatisfiable = 416;

/**
 * How many bytes of a trajectory are held before a part of an upload is written.
 *
 * It is above the five mebibytes a bucket states for a part that is not the last one.
 * A chunk larger than it is written as a part of its own rather than cut, so a part holds the
 * bytes that arrived rather than a size stated here.
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
 * The status a bucket answered a request with, where the SDK reports the request as failed.
 *
 * It tells a bucket that holds nothing from one that could not serve.
 * A request the SDK could not make at all carries no answer, such as an endpoint that does not
 * resolve, so it is reported by the failure alone.
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
 * A request the SDK makes for a bucket, failed as this storage.
 *
 * What the bucket answered with is kept as the cause of the failure, so the status of an answer
 * is read where one failure is told apart from another.
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
 * Fails where an id is taken and the write may not write over it.
 *
 * The bucket is asked for the object, and only an object it does not hold lets the write begin.
 */
const refuse = (bucket: Bucket, id: string): Effect.Effect<void, StorageError> =>
  head(bucket, id).pipe(
    Effect.matchEffect({
      // An id the bucket holds nothing under is free; any other failure is what the
      // write failed with, since nothing says the id is untaken.
      onFailure: (error) => (statusOf(error.cause) === NotFound ? Effect.void : Effect.fail(error)),
      onSuccess: () =>
        Effect.fail(new StorageError({ id, cause: "it already holds a trajectory" })),
    }),
  );

/**
 * The bytes a bucket holds under an id, as the head of the object and the range a read asks for.
 */
const bytesOf = (bucket: Bucket, id: string): Byte<StorageError> =>
  makeByte({
    length: head(bucket, id).pipe(Effect.map((held) => BigInt(held.ContentLength ?? 0))),
    read: (buffer, { offset = 0n, size = buffer.length } = {}) =>
      Effect.gen(function* () {
        const wanted = Math.min(size, buffer.length);

        // A read that asks for nothing reaches the bucket for nothing: what lies from
        // an offset at or past the end of an object is none of it.
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
 * Begins the upload an id is written as.
 *
 * The id is checked where it may not be written over, and the bucket is asked for an upload the
 * parts are written into.
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
 * Writes the chunks held as one part of the upload an id is being written as.
 *
 * The bucket makes an object of the parts where the upload is completed.
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
 * Writes what is left of a trajectory and makes an object of it.
 *
 * An object is put whole where no part was written, and the upload is completed where parts were.
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
    // bucket takes an object of any size in one request.
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
          // refusing to write over one is stated again where the object is made.
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
 * The sink a trajectory is written into an id through.
 *
 * The bytes are held as they arrive, a part is written each time the part being filled holds
 * enough, and the object is made of the parts where the bytes end.
 *
 * What it holds open is an upload rather than a file, which nothing else reads, so the sink states
 * no scope of its own.
 * What the write does not take to an object is aborted where the sink ends, whether the bytes
 * ended or failed.
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
        // The chunk is copied rather than held: a sink is handed bytes that may be
        // written into again before the part they fall in is written.
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
    // ended, failed, or were interrupted, so nothing of a failed trajectory is kept.
    Sink.onExit(() => abort(bucket, id, state)),
  );
};

export const s3Storage = (
  sdk: typeof import("@aws-sdk/client-s3"),
  client: S3Client,
  name: string,
): Storage => {
  const bucket: Bucket = { sdk, client, name };

  return {
    capabilities: { resume: false },
    read: (id) => Effect.succeed(bytesOf(bucket, id)),
    write: (id, write) =>
      write?.mode === "resume"
        ? // A bucket holds an object whole, so what a write continues from an offset
          // is not served. The write fails rather than holding the object until it ends.
          Sink.fail(
            new StorageError({
              id,
              cause: new UnsupportedWrite({ mode: write.mode, offset: write.offset ?? 0n }),
            }),
          )
        : writeInto(bucket, id, write),
  };
};
