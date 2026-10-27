/**
 * The reasons a stored trajectory fails validation.
 *
 * `Loaded.validate` reports these issues where stored bytes are not a
 * complete trajectory: a compression, decoding, or truncation failure, or a
 * digest that does not match the parts.
 *
 * @stability stable
 */

import type { CompressionError } from "@trajs/utils/Compression";
import type { Algorithm as HashAlgorithm } from "@trajs/utils/StreamHash";
import { Data, Formatter } from "effect";
import type { Schema } from "effect";

/**
 * A part frame the recorded compression does not decompress.
 *
 * **Details**
 *
 * `cause` retains the codec failure.
 *
 * @stability stable
 * @category errors
 */
export class CompressionFailure extends Data.TaggedClass("CompressionFailure")<{
  readonly cause: CompressionError;
}> {
  get message(): string {
    return `Failed to decompress the part frame: ${Formatter.format(this.cause)}`;
  }
}

/**
 * A part frame holding a part the config does not decode.
 *
 * **Details**
 *
 * `index` is the zero-based position of the part in the frame.
 * `cause` retains the decoding failure.
 *
 * @stability stable
 * @category errors
 */
export class UndecodablePart extends Data.TaggedClass("UndecodablePart")<{
  readonly index: number;
  readonly cause: Schema.SchemaError;
}> {
  get message(): string {
    return `Failed to decode part ${this.index} of the part frame: ${Formatter.format(this.cause)}`;
  }
}

/**
 * A part frame that ends before its last part does.
 *
 * **Details**
 *
 * `remaining` counts the bytes left after the last whole part.
 *
 * @stability stable
 * @category errors
 */
export class TruncatedFrame extends Data.TaggedClass("TruncatedFrame")<{
  readonly remaining: number;
}> {
  get message(): string {
    return "Failed to read the part frame: it ends in the middle of a part";
  }
}

/**
 * A part digest that does not match the metadata.
 *
 * **Details**
 *
 * `algorithm` is the recorded digest.
 * `expected` is the digest the metadata states.
 * `actual` is the digest the parts hash to.
 *
 * @stability stable
 * @category errors
 */
export class DigestMismatch extends Data.TaggedClass("DigestMismatch")<{
  readonly algorithm: HashAlgorithm;
  readonly expected: string;
  readonly actual: string;
}> {
  get message(): string {
    return `Failed to match the part digest: the metadata records ${this.expected}, and the parts hash to ${this.actual}`;
  }
}

/**
 * Several issues found in one validation.
 *
 * **Details**
 *
 * `issues` holds every issue the check found, in the order it found them.
 *
 * @see {@link Issue} for the individual reasons.
 * @stability stable
 * @category errors
 */
export class Composite extends Data.TaggedClass("Composite")<{
  readonly issues: ReadonlyArray<Issue>;
}> {
  get message(): string {
    return this.issues.map((issue) => issue.message).join("; ");
  }
}

/**
 * Why a stored trajectory does not hold the parts it states.
 *
 * @see {@link Composite} for several issues at once.
 * @stability stable
 * @category errors
 */
export type Issue =
  | CompressionFailure
  | UndecodablePart
  | TruncatedFrame
  | DigestMismatch
  | Composite;
