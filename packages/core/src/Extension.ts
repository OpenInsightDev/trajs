/**
 * Defines the data formats a trajectory may carry.
 *
 * A trajectory records a conversation as a stream of parts. Analysis usually needs
 * more than the conversation: OpenTelemetry spans, per-call metrics, retrieval
 * scores, judge outputs. An extension describes one such format, so that data can
 * be recorded, versioned, validated and queried instead of being dropped into an
 * untyped bag.
 *
 * An extension is an identifier, descriptive metadata and a line of versions of
 * its data. The line is built with `Versions`: the oldest version declares the
 * shape its data started with, and every later version — derived with
 * {@link upgrade} — declares the change into it, so data recorded against any
 * version of the line can still be read. Extensions are collected into an
 * `Extensionkit` and carried by a trajectory, exactly as tools are collected into
 * a toolkit.
 */

import { Data, Schema, SchemaGetter } from "effect";
import { Versions, type Version } from "#/internal/versions.ts";

/**
 * The line of versions of an extension's data.
 *
 * **When to use**
 *
 * Use when declaring an extension's oldest version, and when deriving a later
 * version from it: {@link make} takes a `Versions.make` value and {@link upgrade}
 * derives each version after it.
 *
 * **Details**
 *
 * A line reads data recorded against any of its versions, so a recording of an
 * older shape can still be read as the newest one. `Versions.across` reads the
 * versions of several lines as a single union.
 *
 * @see {@link upgrade} for deriving a later version of an extension.
 * @category schemas
 */
export { Versions, type Version };

/**
 * Descriptive metadata of an extension.
 *
 * **When to use**
 *
 * Use when declaring an extension, or when reading the `metadata` field of one.
 *
 * **Details**
 *
 * Metadata names and describes an extension for a reader of a recording. It is
 * not versioned: how the data changes is declared by the versions of the
 * extension, and the newest of them is the version a recording states.
 *
 * @category models
 */
export class Metadata extends Schema.Class<Metadata>("Metadata")({
  /**
   * Optional name of the extension.
   */
  name: Schema.optional(Schema.String),
  /**
   * Optional description of the extension.
   */
  description: Schema.optional(Schema.String),
}) {}

/**
 * An extension data format a trajectory may carry.
 *
 * **When to use**
 *
 * Use when defining the format of a kind of data attached to a trajectory, or
 * when a function accepts an extension whose identifier and versions it reads.
 *
 * **Details**
 *
 * The identifier is namespaced (reverse domain), for example `dev.observerw.otel`,
 * so that independent producers do not collide. `version` is the line of versions
 * of the extension's data, as built by `Versions`: it reads data recorded
 * against any version up to the newest, and its `self` is the newest version's
 * own shape, which is what a new version is derived from and what an extension
 * records as its current version.
 *
 * An extension value is a value type, not only a contract: it can be compared
 * with `Equal.equals`, and it is pipeable, which is how a version is derived
 * with {@link upgrade}.
 *
 * An extension whose versions are not known — {@link Any}, and the element type of
 * `Extensionkit.Any` — reads them as a schema of unknown shape, so data can still
 * be decoded with it, but not against the fields of a particular version.
 *
 * The identifier and metadata of an extension are fixed for its whole life: a
 * derived version is still the same extension, so {@link upgrade} keeps both —
 * deriving the metadata too when the change also describes the extension
 * differently.
 *
 * @see {@link make} for declaring an extension.
 * @see `Extensionkit` for collecting extensions into the set a trajectory is
 * recorded with.
 * @category models
 */
export class Extension<
  out Id extends string = string,
  out Versions extends Schema.Top = Schema.Decoder<unknown>,
> extends Data.Class<{
  /**
   * Namespaced identifier of the extension.
   */
  readonly id: Id;
  /**
   * Descriptive metadata of the extension.
   */
  readonly metadata: Metadata;
  /**
   * The versions of the extension's data, newest first.
   */
  readonly version: Versions;
}> {}

/**
 * An extension of unknown identifier and versions.
 *
 * **Details**
 *
 * Its versions are read as a schema of unknown shape, so an extension that was
 * declared elsewhere can still have its data decoded, but not against the fields
 * of a particular version.
 *
 * @category models
 */
export type Any = Extension<string, Schema.Decoder<unknown>>;

/**
 * Declares an extension data format.
 *
 * **When to use**
 *
 * Use when a trajectory should carry a kind of data that is not part of the
 * conversation itself, such as OpenTelemetry spans or per-call metrics.
 *
 * **Details**
 *
 * The version is the oldest one of the extension, built by `Versions.make`; later
 * versions are derived from the extension with {@link upgrade}. Metadata declares
 * nothing about the data, so it may be empty.
 *
 * **Example** (Declaring an extension)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.observerw.otel",
 *   Extension.Metadata.make({ name: "OpenTelemetry" }),
 *   Extension.Versions.make(Schema.Struct({
 *     version: Schema.Literal("1.0.0"),
 *     spanId: Schema.String
 *   }))
 * )
 * otel.id // => "dev.observerw.otel"
 * ```
 *
 * @see {@link upgrade} for deriving a later version of an extension.
 * @category constructors
 */
export const make = <
  const Id extends string,
  Self extends Schema.Struct<{ readonly version: Schema.Literal<string> }>,
  Members extends ReadonlyArray<Schema.Top>,
>(
  id: Id,
  metadata: Metadata,
  version: Version<Self, Members>,
): Extension<Id, Version<Self, Members>> => new Extension({ id, metadata, version });

/**
 * Derives the next version of an extension.
 *
 * **When to use**
 *
 * Use when the data of an extension changes, so that a recording of the older
 * shape can still be read as the newer one.
 *
 * **Details**
 *
 * The version is declared as `Versions.upgrade` declares it: `fields` extends the
 * fields of the extension's newest version, and `change.decode` maps a value of
 * that version to the encoded form of the new one, which the new version's own
 * schema then validates. The identifier is carried over, because a new version is
 * the same extension.
 *
 * Metadata is derived the same way: `metadata` receives the metadata of the
 * version being derived from and returns the metadata of the new one, so a change
 * that also describes the extension differently says only what changes. It is
 * carried over when no mapping is given.
 *
 * `decode` is a plain function rather than a `SchemaGetter`, so the encoded form
 * it returns is checked against the new version's own schema — the thing a
 * version change gets wrong.
 *
 * **Example** (Deriving a version)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.observerw.otel",
 *   Extension.Metadata.make({}),
 *   Extension.Versions.make(Schema.Struct({
 *     version: Schema.Literal("1.0.0"),
 *     spanId: Schema.String
 *   }))
 * )
 *
 * const timed = otel.pipe(
 *   Extension.upgrade(
 *     (fields) => ({ ...fields, version: Schema.Literal("1.1.0"), durationMs: Schema.Number }),
 *     {
 *       decode: (from) => ({ ...from, version: "1.1.0", durationMs: 0 })
 *     },
 *     (previous) => Extension.Metadata.make({ name: previous.name, description: "Timed spans" })
 *   )
 * )
 *
 * const span = Schema.decodeUnknownSync(timed.version)({ version: "1.0.0", spanId: "s1" })
 * span.durationMs // => 0
 * ```
 *
 * @see {@link make} for declaring the oldest version of an extension.
 * @category combinators
 */
export const upgrade =
  <
    Prev extends Version<Schema.Struct<Schema.Struct.Fields>, ReadonlyArray<Schema.Top>>,
    More extends Schema.Struct.Fields & { readonly version: Schema.Literal<string> },
  >(
    fields: (previous: Prev["self"]["fields"]) => More,
    change: {
      /**
       * Produces this version's encoded form, which its own schema then validates.
       */
      readonly decode: (from: Prev["Type"]) => Schema.Struct<More>["Encoded"];
    },
    metadata?: (previous: Metadata) => Metadata,
  ) =>
  <Id extends string>(extension: Extension<Id, Prev>) => {
    const version = Versions.upgrade<Prev, More>(fields, {
      decode: SchemaGetter.transform(change.decode),
    })(extension.version);

    return new Extension({
      id: extension.id,
      metadata: metadata?.(extension.metadata) ?? extension.metadata,
      version,
    });
  };
