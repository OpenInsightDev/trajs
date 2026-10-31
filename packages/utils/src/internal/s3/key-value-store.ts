/**
 * The key/value store of a bucket: one object per value, named by its key, as
 * `ByteStore.layerS3` provides it.
 */

import type { S3Client } from "@aws-sdk/client-s3";
import { Effect } from "effect";
import { KeyValueStore } from "effect/persistence";

import { type Bucket, NotFound, statusOf } from "#/internal/s3/bucket.ts";

/**
 * A request the SDK makes for a bucket, failed as this store.
 *
 * What the bucket answered with is kept as the cause of the failure, so the status of an answer
 * is read where one failure is told apart from another.
 */
const attempted = <A>(
  bucket: Bucket,
  verb: string,
  key: string | undefined,
  send: () => Promise<A>,
): Effect.Effect<A, KeyValueStore.KeyValueStoreError> =>
  Effect.tryPromise({
    try: send,
    catch: (cause) =>
      new KeyValueStore.KeyValueStoreError({
        method: verb,
        key,
        message:
          key === undefined
            ? `Unable to ${verb} the store`
            : `Unable to ${verb} the entry '${key}'`,
        cause,
      }),
  });

/** The bytes the bucket holds under a key, or nothing where it holds no object under it. */
const bytesOf = (
  bucket: Bucket,
  key: string,
): Effect.Effect<Uint8Array | undefined, KeyValueStore.KeyValueStoreError> =>
  attempted(bucket, "get", key, () =>
    bucket.client.send(new bucket.sdk.GetObjectCommand({ Bucket: bucket.name, Key: key })),
  ).pipe(
    Effect.flatMap((answered) => {
      const body = answered.Body;

      return body === undefined
        ? Effect.succeed(undefined)
        : attempted(bucket, "get", key, () => body.transformToByteArray());
    }),
    // A key the bucket holds no object under is a key the store holds no value
    // under, which is served as none rather than as a failure.
    Effect.catchIf(
      (error) => statusOf(error.cause) === NotFound,
      () => Effect.succeed(undefined),
    ),
  );

/**
 * Says whether the bucket holds an object under a key, by the head of the object.
 *
 * The body is not read, so an entry is checked without the bytes it holds.
 */
const holds = (
  bucket: Bucket,
  key: string,
): Effect.Effect<boolean, KeyValueStore.KeyValueStoreError> =>
  attempted(bucket, "find", key, () =>
    bucket.client.send(new bucket.sdk.HeadObjectCommand({ Bucket: bucket.name, Key: key })),
  ).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        statusOf(error.cause) === NotFound ? Effect.succeed(false) : Effect.fail(error),
      onSuccess: () => Effect.succeed(true),
    }),
  );

/**
 * The keys the bucket holds under `prefix`, one page at a time, until the bucket
 * states no more.
 *
 * A page holds at most the thousand keys one delete request takes.
 */
const eachPage = (
  bucket: Bucket,
  prefix: string | undefined,
  page: (keys: ReadonlyArray<string>) => Effect.Effect<void, KeyValueStore.KeyValueStoreError>,
): Effect.Effect<void, KeyValueStore.KeyValueStoreError> =>
  Effect.gen(function* () {
    let token: string | undefined;

    do {
      const listed = yield* attempted(bucket, "list", undefined, () =>
        bucket.client.send(
          new bucket.sdk.ListObjectsV2Command({
            Bucket: bucket.name,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        ),
      );

      yield* page(
        (listed.Contents ?? []).flatMap((object) => (object.Key === undefined ? [] : [object.Key])),
      );

      token = listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
    } while (token !== undefined);
  });

/** Drops the objects the bucket holds under the keys of one page. */
const drop = (
  bucket: Bucket,
  keys: ReadonlyArray<string>,
): Effect.Effect<void, KeyValueStore.KeyValueStoreError> =>
  keys.length === 0
    ? Effect.void
    : attempted(bucket, "clear", undefined, () =>
        bucket.client.send(
          new bucket.sdk.DeleteObjectsCommand({
            Bucket: bucket.name,
            Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: true },
          }),
        ),
      ).pipe(Effect.asVoid);

export const s3KeyValueStore = (
  sdk: typeof import("@aws-sdk/client-s3"),
  client: S3Client,
  name: string,
): KeyValueStore.KeyValueStore => {
  const bucket: Bucket = { sdk, client, name };

  const keys: Effect.Effect<ReadonlyArray<string>, KeyValueStore.KeyValueStoreError> = Effect.gen(
    function* () {
      const held: Array<string> = [];

      yield* eachPage(bucket, undefined, (page) =>
        Effect.sync(() => {
          held.push(...page);
        }),
      );

      return held;
    },
  );

  return KeyValueStore.make({
    get: (key) =>
      bytesOf(bucket, key).pipe(
        Effect.map((bytes) => (bytes === undefined ? undefined : new TextDecoder().decode(bytes))),
      ),
    getUint8Array: (key) => bytesOf(bucket, key),
    set: (key, value) =>
      attempted(bucket, "set", key, () =>
        bucket.client.send(
          new bucket.sdk.PutObjectCommand({ Bucket: bucket.name, Key: key, Body: value }),
        ),
      ).pipe(Effect.asVoid),
    remove: (key) =>
      attempted(bucket, "remove", key, () =>
        bucket.client.send(new bucket.sdk.DeleteObjectCommand({ Bucket: bucket.name, Key: key })),
      ).pipe(Effect.asVoid),
    has: (key) => holds(bucket, key),
    clear: eachPage(bucket, undefined, (page) => drop(bucket, page)),
    clearPrefix: (prefix) => eachPage(bucket, prefix, (page) => drop(bucket, page)),
    size: Effect.map(keys, (held) => held.length),
    keys,
  });
};
