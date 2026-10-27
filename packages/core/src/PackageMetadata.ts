/**
 * What a package states of itself in its `package.json`.
 *
 * {@link PackageMetadata} holds the fields that identify the package and its
 * repository.
 *
 * @stability stable
 */

import { Schema } from "effect";

/** A person a `package.json` states, as a string or as the fields that name one. */
const Person = Schema.Union([
  Schema.String,
  Schema.Struct({
    name: Schema.String,
    email: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
  }),
]);

/** A repository a `package.json` states, as a string or as the fields that name one. */
const Repository = Schema.Union([
  Schema.String,
  Schema.Struct({
    type: Schema.optional(Schema.String),
    url: Schema.String,
    directory: Schema.optional(Schema.String),
  }),
]);

/**
 * Schema for the fields a `package.json` states about the package itself.
 *
 * **When to use**
 *
 * Use as the `packageMetadata` of an event, a metric, or an extra declaration, so a
 * trajectory states the release and the repository of the package that declared its
 * data.
 *
 * **Details**
 *
 * The fields are the identifying ones of the
 * [schemastore `package.json` schema](https://www.schemastore.org/package.json).
 * `author` and `repository` also accept the string form a `package.json` permits.
 * `name` is not one of them: a declaration states it as its `packageName`, which its
 * tag is built from. That name is written out as a literal rather than read off the
 * file, since the tag's type is built from it. What states how the package is built
 * rather than what it is, such as `scripts` and `dependencies`, is left out.
 *
 * A declaration states the package it is written in, which attaches what that
 * package's `package.json` holds rather than restating it:
 *
 * **Example** (Attaching the declaring package)
 *
 * ```ts import.meta.vitest
 * import pkg from "../package.json" with { type: "json" }
 * import { PackageMetadata } from "@trajs/core"
 * import { Schema } from "effect"
 *
 * const stated = Schema.decodeUnknownSync(PackageMetadata)(pkg)
 *
 * stated.license // => "MIT"
 * ```
 *
 * **Gotchas**
 *
 * `version` is required, so a package states one before its declarations can attach
 * it.
 *
 * @stability stable
 * @category schemas
 */
export const PackageMetadata = Schema.Struct({
  version: Schema.String,
  description: Schema.optional(Schema.String),
  keywords: Schema.optional(Schema.Array(Schema.String)),
  homepage: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  author: Schema.optional(Person),
  repository: Schema.optional(Repository),
});

/**
 * The fields a `package.json` states about the package itself.
 *
 * @see {@link PackageMetadata} for the schema.
 * @stability stable
 * @category models
 */
export type PackageMetadata = Schema.Schema.Type<typeof PackageMetadata>;
