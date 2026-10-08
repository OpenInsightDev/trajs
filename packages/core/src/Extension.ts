/**
 * Defines the extension data formats a trajectory may carry.
 *
 * A trajectory records a conversation as a stream of parts. Analysis usually
 * needs more than the conversation: OpenTelemetry spans, per-call metrics,
 * retrieval scores, judge outputs. An extension describes one such format, so
 * that data can be recorded, versioned, validated and queried instead of being
 * dropped into an untyped bag.
 *
 * An extension is defined by an identifier, a semantic version and a Schema for
 * its data. Definitions are collected into {@link Extensions} and carried by a
 * trajectory, exactly as tools are collected into a toolkit: the parts of a
 * recording are decoded with the definitions they were recorded against, and
 * data whose definition is missing degrades to an unconstrained part instead of
 * failing to load.
 */

import { Effect, JsonSchema, Predicate, Schema, Stream } from "effect";
import type { Tool } from "effect/ai";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

const ExtensionTypeId = "~trajs/Extension" as const;

/**
 * An extension data format a trajectory may carry.
 *
 * **When to use**
 *
 * Use when defining the format of a kind of data attached to a trajectory, or
 * when a function accepts an extension whose identifier and schema it reads.
 *
 * **Details**
 *
 * The identifier is namespaced (reverse-DNS or URI), for example `dev.trajs.otel`,
 * so that independent producers do not collide. The version follows semantic
 * versioning and is recorded alongside the data. The schema describes the data
 * the extension attaches; how permissive it is, including how it treats unknown
 * fields, is decided by the schema itself.
 *
 * @see {@link Extensions} for collecting definitions into a trajectory.
 * @category models
 */
export interface Extension<
  out Id extends string = string,
  out Data = unknown,
  out Encoded = unknown,
> {
  readonly [ExtensionTypeId]: typeof ExtensionTypeId;
  /**
   * Namespaced identifier of the extension.
   */
  readonly id: Id;
  /**
   * Version of the extension, following semantic versioning.
   */
  readonly version: string;
  /**
   * Schema of the data the extension attaches.
   */
  readonly schema: Schema.Codec<Data, Encoded>;
}

/**
 * An extension of unknown identifier and data.
 *
 * @category models
 */
export type Any = Extension<string, unknown, unknown>;

/**
 * Type guard to check if a value is an extension definition.
 *
 * **When to use**
 *
 * Use to check whether a value is an extension definition before reading its
 * identifier or schema.
 *
 * @category guards
 */
export const isExtension = (u: unknown): u is Any => Predicate.hasProperty(u, ExtensionTypeId);

/**
 * Defines an extension data format.
 *
 * **When to use**
 *
 * Use when a trajectory should carry a kind of data that is not part of the
 * conversation itself, such as OpenTelemetry spans or per-call metrics.
 *
 * **Example** (Defining an extension)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extension } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.trajs.otel",
 *   "1.0.0",
 *   Schema.Struct({ spanId: Schema.String, durationMs: Schema.Number })
 * )
 * otel.id // => "dev.trajs.otel"
 * ```
 *
 * @category constructors
 */
export const make = <const Id extends string, Data, Encoded>(
  id: Id,
  version: string,
  schema: Schema.Codec<Data, Encoded>,
): Extension<Id, Data, Encoded> => ({
  [ExtensionTypeId]: ExtensionTypeId,
  id,
  version,
  schema,
});

/**
 * A set of extension definitions, keyed by their identifier.
 *
 * **When to use**
 *
 * Use as the type of the `extensions` field of a trajectory, or of the
 * definitions a function decodes with.
 *
 * @category models
 */
export type Extensions<Definitions extends Record<string, Any> = Record<string, Any>> =
  Readonly<Definitions>;

/**
 * The extension definitions a list of definitions yields, keyed by identifier.
 *
 * @category models
 */
export type Of<Definitions extends ReadonlyArray<Any>> = {
  readonly [Definition in Definitions[number] as Definition["id"]]: Definition;
};

/**
 * The merged extension definitions of a list of sets.
 *
 * @category models
 */
export type Merged<Collections extends ReadonlyArray<Record<string, Any>>> = {
  readonly [Key in keyof Collections[number]]: Collections[number][Key];
};

/**
 * Collects extension definitions into a set.
 *
 * **When to use**
 *
 * Use when building the definitions a trajectory is recorded or decoded with.
 *
 * @see {@link Extensions} for the `merge` and `empty` operations.
 * @category constructors
 */
export const Extensions = {
  /**
   * A set with no extension definitions.
   */
  empty: {} as Extensions<Record<string, never>>,
  /**
   * Collects extension definitions into a set, keyed by identifier.
   */
  make: <const Definitions extends ReadonlyArray<Any>>(
    ...definitions: Definitions
  ): Of<Definitions> =>
    Object.fromEntries(
      definitions.map((definition) => [definition.id, definition]),
    ) as Of<Definitions>,
  /**
   * Merges sets of extension definitions, later definitions overriding earlier
   * ones with the same identifier.
   */
  merge: <const Collections extends ReadonlyArray<Record<string, Any>>>(
    ...collections: Collections
  ): Merged<Collections> => Object.assign({}, ...collections) as Merged<Collections>,
} as const;

/**
 * Serialized form of an extension definition, as stored in a trajectory header.
 *
 * **When to use**
 *
 * Use to describe a recorded extension to a consumer that does not have the
 * definition installed.
 *
 * **Details**
 *
 * The version is recorded verbatim and the schema is converted to a draft-07
 * JSON Schema document, so the shape of the data is readable without the Effect
 * Schema it was built from.
 *
 * @category models
 */
export type ExtensionEncoded = Readonly<{
  version: string;
  schema: JsonSchema.Document<"draft-07">;
}>;

/**
 * Serializes extension definitions into their encoded form.
 *
 * **When to use**
 *
 * Use when writing the header of a recorded trajectory.
 *
 * @category encoding
 */
export const encode = (definitions: Extensions): Record<string, ExtensionEncoded> =>
  Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [
      id,
      {
        version: definition.version,
        schema: JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(definition.schema)),
      },
    ]),
  );

/**
 * Streams the extension parts of a trajectory.
 *
 * **When to use**
 *
 * Use to read every extension datum of a trajectory, whether or not a definition
 * describes it.
 *
 * @see {@link select} for reading the data of a single extension, typed by its
 * definition.
 * @category combinators
 */
export const parts = <Tools extends Record<string, Tool.Any>>(
  trajectory: Trajectory.Trajectory<Tools>,
): Stream.Stream<Trajectory.AnyExtensionPart, TrajectoryError> =>
  trajectory.pipe(Stream.filter(Trajectory.isExtensionPart));

/**
 * Streams the data of a single extension.
 *
 * **When to use**
 *
 * Use to analyze the data a specific extension attached to a trajectory, with
 * the data typed by the definition.
 *
 * **Details**
 *
 * Parts are selected by identifier and their data decoded with the definition's
 * schema. Parts of another extension are skipped, and a datum whose payload the
 * definition does not describe is reported as {@link TrajectoryError}.
 *
 * **Example** (Reading the data of an extension)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Toolkit } from "effect/ai"
 * import { Extension, Trajectory } from "@trajs/core"
 *
 * const otel = Extension.make(
 *   "dev.trajs.otel",
 *   "1.0.0",
 *   Schema.Struct({ spanId: Schema.String })
 * )
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(Trajectory.anyExtensionPart({ extension: "dev.trajs.otel", data: { spanId: "s1" } })),
 *   Toolkit.empty
 * )
 *
 * const spans = await Effect.runPromise(Stream.runCollect(Extension.select(otel)(trajectory)))
 * Array.from(spans, (span) => span.spanId) // => ["s1"]
 * ```
 *
 * @category combinators
 */
export const select =
  <Id extends string, Data, Encoded>(definition: Extension<Id, Data, Encoded>) =>
  <Tools extends Record<string, Tool.Any>>(
    trajectory: Trajectory.Trajectory<Tools>,
  ): Stream.Stream<Data, TrajectoryError> =>
    trajectory.pipe(
      Stream.filter(Trajectory.isExtensionPart),
      Stream.filter((part) => part.extension === definition.id),
      Stream.mapEffect((part) =>
        Schema.decodeUnknownEffect(definition.schema)(part.data).pipe(
          Effect.mapError(TrajectoryError.decodeExtension(definition.id)),
        ),
      ),
    );

/**
 * A message of a trajectory together with the data of an extension anchored to
 * it.
 *
 * **When to use**
 *
 * Use to read the data an extension recorded about the messages of a
 * trajectory, such as the metrics or spans a message produced.
 *
 * @see {@link attach} for producing these.
 * @category models
 */
export type Attached<Tools extends Record<string, Tool.Any>, Data> = Readonly<{
  /**
   * The message the data is about.
   */
  part: Exclude<Trajectory.Part<Tools>, { readonly _tag: "Extension" }>;
  /**
   * The data anchored to the message, in the order it was recorded.
   */
  data: ReadonlyArray<Data>;
}>;

/**
 * Pairs the messages of a trajectory with the data of an extension anchored to
 * them.
 *
 * **When to use**
 *
 * Use to read the data a specific extension recorded about the messages of a
 * trajectory, with the data typed by the definition.
 *
 * **Details**
 *
 * A message is included once at least one datum of the extension is anchored to
 * it, so every result carries data. Data anchored to no message belongs to the
 * timeline rather than to a message and is not included; read it with
 * {@link select}. A datum whose payload the definition does not describe is
 * reported as {@link TrajectoryError}.
 *
 * @see {@link select} for the data of an extension without its messages.
 * @category combinators
 */
export const attach =
  <Id extends string, Data, Encoded>(definition: Extension<Id, Data, Encoded>) =>
  <Tools extends Record<string, Tool.Any>>(
    trajectory: Trajectory.Trajectory<Tools>,
  ): Effect.Effect<ReadonlyArray<Attached<Tools, Data>>, TrajectoryError> =>
    Effect.gen(function* () {
      const decodeDatum = Schema.decodeUnknownEffect(definition.schema);
      const parts = yield* Stream.runCollect(trajectory);
      const anchored = new Map<string, Array<Data>>();

      for (const part of parts) {
        if (part._tag !== "Extension" || part.extension !== definition.id) {
          continue;
        }

        if (part.anchor === undefined) {
          continue;
        }

        const data = yield* decodeDatum(part.data).pipe(
          Effect.mapError(TrajectoryError.decodeExtension(definition.id)),
        );
        const list = anchored.get(part.anchor);

        if (list === undefined) {
          anchored.set(part.anchor, [data]);
        } else {
          list.push(data);
        }
      }

      const attached: Array<Attached<Tools, Data>> = [];

      for (const part of parts) {
        if (part._tag === "Extension") {
          continue;
        }

        const data = anchored.get(part.uuid);

        if (data !== undefined) {
          attached.push({ part, data });
        }
      }

      return attached;
    });
