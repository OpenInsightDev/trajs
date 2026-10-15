/**
 * What a storage failed with: bytes that could not be read, or a place they could
 * not be written to.
 *
 * A recording is read and written through a storage, so the failure of one is
 * told apart from the failure of a recording: bytes that do not hold what a
 * recording is made of are a {@link TrajectoryError}, where a storage that is
 * missing, that refused or that was cut short is this error. What raises it for
 * the storage this package ships is {@link asStorageError}, and what a program
 * reaches it through is `Exchange.load` and `Exchange.save`.
 *
 * Nothing here is published: an exchange reports what the storage it was provided
 * failed with as this error rather than as a recording that failed.
 */

import { Data, PlatformError } from "effect";

import { failure } from "#/TrajectoryError.ts";

/**
 * What a storage failed with: bytes that could not be read, or a place they could
 * not be written to.
 *
 * **When to use**
 *
 * Use to tell the failure of a storage apart from the failure of a recording: a
 * storage that is missing, that refused, or that was cut short fails as this
 * error, where bytes that do not hold what a recording is made of fail as a
 * {@link TrajectoryError}.
 *
 * **Details**
 *
 * `id` names the recording the storage was asked about — the one whose bytes
 * could not be read, or the one that could not be written — and `cause` is what
 * the storage failed with, as it reported it: the failure of a file system, the
 * message a bucket answered with, or the description of what a byte sequence did
 * not hold.
 *
 * @see {@link Bytes} for the reads a storage serves.
 * @see {@link Storage} for the writes one takes.
 */
export class StorageError extends Data.TaggedError("StorageError")<{
  id: string;
  cause: unknown;
}> {
  override get message(): string {
    return `Failed to read or write '${this.id}': ${failure(this.cause)}`;
  }
}

/**
 * What the file system failed an operation on a recording with, as the failure of
 * the storage that asked it.
 *
 * A storage reports what it failed with as the {@link StorageError} of the
 * recording it was asked about, so the failure of the file system is carried as
 * the `cause` of one rather than passed through as it is.
 */
export const asStorageError =
  (id: string) =>
  (cause: PlatformError.PlatformError): StorageError =>
    new StorageError({ id, cause });
