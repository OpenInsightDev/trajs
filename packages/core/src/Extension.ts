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
 *
 * An extension also declares the services a producer of its data needs — the
 * tokenizer an estimate is counted with, the tracer a span is recorded by — the
 * way a tool declares the services its handler needs. They are carried in the
 * type alone and read with {@link Requirements}, so what producing the data takes
 * is stated with the format rather than by every caller of a producer. The
 * producer itself is written apart from the extension — a {@link Producer} reads
 * the messages of a recording and writes the data of one extension — and the set a
 * recording is made with is what carries it, through
 * `Extensionkit.withProducers`.
 */

import { Context, Data, Schema, SchemaGetter, Stream, Types } from "effect";
import { Versions, type Version } from "#/internal/versions.ts";
import type { Tool } from "effect/ai";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "./TrajectoryError.ts";

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
 * The type parameter `Requirements` declares the services a producer of the
 * extension's data needs. It is phantom — no field of an extension depends on it
 * — so it is declared through {@link make} and read with {@link Requirements},
 * and nothing checks at runtime that a producer provides the services, because
 * the declaration is a contract of the type. Requirements are covariant, so an
 * extension that declares none is usable where one that declares some is
 * expected, and not the reverse. A derived version is still the same extension,
 * so {@link upgrade} carries the requirements over.
 *
 * An extension whose versions are not known — {@link Any}, and the element type of
 * `Extensionkit.Any` — reads them as a schema of unknown shape, so data can still
 * be decoded with it, but not against the fields of a particular version. The
 * services its data needs are unknown there as well, so an extension of any
 * requirements is one.
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
  out Requirements = never,
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
}> {
  /**
   * Declared rather than assigned, so the requirements of an extension are
   * carried by its type without becoming part of its value; it is what keeps
   * them covariant.
   */
  declare readonly [RequirementsTypeId]: {
    readonly _Requirements: Types.Covariant<Requirements>;
  };

  /**
   * Declares one more service the data of this extension needs.
   *
   * **When to use**
   *
   * Use when an extension is produced with a service the extension itself does
   * not declare, such as one a recording provides for a single run instead of a
   * producer needing it every time.
   *
   * **Details**
   *
   * The returned extension is the same identifier, metadata and line of versions
   * with the given service added to its {@link Requirements}, so the extension it
   * was called on is left unchanged. Nothing is checked at runtime, because the
   * addition is a contract of the type alone.
   *
   * @see {@link make} for declaring the services an extension needs when it is
   * declared.
   * @category combinators
   */
  addDependency<Identifier, Service>(
    _tag: Context.Key<Identifier, Service>,
  ): Extension<Id, Versions, Requirements | Identifier> {
    // SAFETY: the requirements of an extension are carried by the type and nothing
    // else, so the extension is rebuilt from the fields it already holds.
    return new Extension({
      id: this.id,
      metadata: this.metadata,
      version: this.version,
    }) as Extension<Id, Versions, Requirements | Identifier>;
  }
}

/**
 * An identifier of its own keeps the marker from colliding with the fields of an
 * extension, which are the data of an extension rather than what producing it
 * takes.
 */
const RequirementsTypeId = "~trajs/Extension/Requirements" as const;

/**
 * The services a producer of an extension's data needs.
 *
 * **When to use**
 *
 * Use when a function produces the data of an extension and should state what it
 * needs to be run, such as the producer of a recording that annotates parts with
 * the extension's data.
 *
 * **Details**
 *
 * The requirements are the ones an extension declares, whether through
 * {@link make} or by `addDependency`. They are the identifiers a program yields
 * to be given a service rather than the services themselves, so they are the
 * requirements of an `Effect` or a `Stream` as they are. An extension that
 * declares none has no requirements, and a derived version keeps those of the
 * extension it was derived from.
 *
 * @see {@link make} for declaring the services an extension needs.
 * @see {@link Extension} for the type parameter they are read off.
 * @category models
 */
export type Requirements<Ext> =
  Ext extends Extension<infer _Id, infer _Versions, infer Declared> ? Declared : never;

/**
 * An extension of unknown identifier, versions and requirements.
 *
 * **Details**
 *
 * Its versions are read as a schema of unknown shape, so an extension that was
 * declared elsewhere can still have its data decoded, but not against the fields
 * of a particular version. The services its data needs are unknown too, so an
 * extension of any requirements is one.
 *
 * @category models
 */
export type Any = Extension<string, Schema.Decoder<unknown>, any>;

/**
 * The data one datum of an extension records: the value a producer wrote, and the
 * parts it is about.
 *
 * **When to use**
 *
 * Use as the type of what a producer writes, or when reading what a producer
 * wrote before it is recorded as a part.
 *
 * **Details**
 *
 * `data` is the value of the extension's newest version, taken off the line the
 * extension carries, so a producer writes the version the extension states rather
 * than one a recording holds. `attach` names the parts the datum is about by their
 * identifier, and is absent when the datum is about the recording rather than
 * about a part of it.
 *
 * @see {@link Producer} for the function that writes one.
 * @see `Trajectory.ExtensionPart` for the part a datum is recorded as.
 * @category models
 */
export type ProducerOutput<Ext extends Any> = Readonly<{
  data: Ext["version"]["Type"];
  attach?: [string, ...string[]];
}>;

/**
 * Writes the data of one extension from the messages of a trajectory.
 *
 * **When to use**
 *
 * Use when the data of an extension is derived from a recording rather than
 * recorded as it happens: what each part is worth to a model, a span that
 * summarises a turn, a verdict on a whole conversation.
 *
 * **Details**
 *
 * A producer reads the messages of a recording as a stream and writes the data of
 * one extension as a stream, so it may write as it reads — one datum per part — or
 * read the recording to its end before writing, when the datum is about the
 * recording rather than about one of its parts. The two streams are independent,
 * so what a datum is about is named by its `attach` rather than by the position it
 * was written at.
 *
 * The services a producer needs are the ones its extension declares
 * ({@link Requirements}), so what producing the data takes travels with the format
 * rather than with every caller of a producer. The failures a producer raises are
 * its own: they travel in the error channel of the stream it returns, beside the
 * `TrajectoryError` a recording reports.
 *
 * A producer is not a field of the extension it writes for: it is carried by the
 * set of extensions a recording is made with.
 * `Extensionkit.withProducers` takes one producer per extension of a set, keyed by
 * the identifier of the extension, and rejects a set whose producers are missing,
 * unknown or written for another extension's data.
 *
 * **Example** (Writing what a part is about)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Extension, Trajectory } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.observerw.otel",
 *   Extension.Metadata.make({ name: "OpenTelemetry" }),
 *   Extension.Versions.make(Schema.Struct({
 *     version: Schema.Literal("1.0.0"),
 *     spanId: Schema.String
 *   }))
 * )
 *
 * const span: Extension.Producer<typeof otel> = (messages) =>
 *   Stream.map(messages, (part) => ({
 *     data: { version: "1.0.0", spanId: part.uuid },
 *     attach: [part.uuid]
 *   }))
 *
 * const part = Trajectory.promptPart(Prompt.make("Hello"))
 * const recorded = Trajectory.make(Stream.make(part))
 * const written = await Effect.runPromise(
 *   Stream.runCollect(span(Trajectory.messages(recorded)))
 * )
 *
 * Array.from(written)[0].attach // => [part.uuid]
 * ```
 *
 * @see {@link Requirements} for the services a producer takes.
 * @see `Extensionkit.withProducers` for attaching producers to a set.
 * @category models
 */
export type Producer<Ext extends Any, E = never, R = Requirements<Ext>> = <
  Tools extends Record<string, Tool.Any>,
>(
  messages: Trajectory.MessageStream<Tools, E, R>,
) => Stream.Stream<ProducerOutput<Ext>, E | TrajectoryError, R>;

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
 * `dependencies` names the services a producer of the data needs, which the
 * returned extension carries as its {@link Requirements}: the tokenizer an
 * estimate is counted with, the tracer a span is recorded by. Nothing checks at
 * runtime that the services are provided where the data is produced, so they
 * describe what a producer takes rather than what it is given.
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
 * **Example** (Declaring the services an extension's data needs)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Schema } from "effect"
 * import { Extension } from "@trajs/core"
 *
 * class Tokenizer extends Context.Service<Tokenizer, {
 *   readonly count: (text: string) => Effect.Effect<number>
 * }>()("Tokenizer") {}
 *
 * const estimate = Extension.make(
 *   "org.js.tra.tokenize",
 *   Extension.Metadata.make({ name: "Token estimate" }),
 *   Extension.Versions.make(Schema.Struct({
 *     version: Schema.Literal("1.0.0"),
 *     tokens: Schema.Number
 *   })),
 *   { dependencies: [Tokenizer] }
 * )
 *
 * const counted = Effect.gen(function* () {
 *   const tokenizer = yield* Tokenizer
 *
 *   return yield* tokenizer.count("Hello")
 * })
 *
 * // A producer of an estimate takes the tokenizer the extension declares.
 * const declared: Effect.Effect<number, never, Extension.Requirements<typeof estimate>> = counted
 *
 * await Effect.runPromise(Effect.provideService(declared, Tokenizer, {
 *   count: () => Effect.succeed(1)
 * })) // => 1
 * ```
 *
 * @see {@link upgrade} for deriving a later version of an extension.
 * @category constructors
 */
export const make = <
  const Id extends string,
  Self extends Schema.Struct<{ readonly version: Schema.Literal<string> }>,
  Members extends ReadonlyArray<Schema.Top>,
  const Dependencies extends ReadonlyArray<Context.Key<any, any>> = [],
>(
  id: Id,
  metadata: Metadata,
  version: Version<Self, Members>,
  // The declared services live in the type alone, so no option is read here.
  _options?: {
    /**
     * Services a producer of the extension's data needs.
     */
    readonly dependencies?: Dependencies;
  },
): Extension<Id, Version<Self, Members>, Context.Service.Identifier<Dependencies[number]>> =>
  new Extension({ id, metadata, version });

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
 * carried over when no mapping is given. The {@link Requirements} of the
 * extension are carried over as well, because a new version is still the same
 * extension, produced by the same code.
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
  <Id extends string, Declared>(extension: Extension<Id, Prev, Declared>) => {
    const version = Versions.upgrade<Prev, More>(fields, {
      decode: SchemaGetter.transform(change.decode),
    })(extension.version);

    // SAFETY: a derived version is the same extension, so it takes the same
    // services to produce as the extension it was derived from.
    return new Extension({
      id: extension.id,
      metadata: metadata?.(extension.metadata) ?? extension.metadata,
      version,
    }) as Extension<Id, typeof version, Declared>;
  };
