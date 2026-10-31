/**
 * What one bucket is reached through, and what it answered a request with.
 */

import type { S3Client } from "@aws-sdk/client-s3";

/**
 * What one bucket is reached through: the client that sends to it, the name the
 * bucket is held under, and the commands of the AWS SDK read to reach it.
 */
export interface Bucket {
  readonly sdk: typeof import("@aws-sdk/client-s3");
  readonly client: S3Client;
  readonly name: string;
}

/** What a bucket answered where it holds nothing under the key asked for. */
export const NotFound = 404;

/**
 * The status a bucket answered a request with, where the SDK reports the request as failed.
 *
 * It tells a bucket that holds nothing from one that could not serve.
 * A request the SDK could not make at all carries no answer, such as an endpoint that does not
 * resolve, so it is reported by the failure alone.
 */
export const statusOf = (cause: unknown): number | undefined => {
  // SAFETY: every error the SDK reports is an object carrying the answer it reported
  // it from under `$metadata`; what carries none is not such an error, and nothing is
  // read of it rather than a status read from the wrong place.
  const answered = cause as
    | { readonly $metadata?: { readonly httpStatusCode?: number } }
    | undefined;

  return answered?.$metadata?.httpStatusCode;
};
