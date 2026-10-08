/**
 * Serializes the toolkit of a trajectory and rebinds recorded trajectories to it.
 *
 * A tool is described by draft-07 JSON Schema documents, so a toolkit can be
 * stored and sent to a provider without the Effect Schemas it was built from.
 * A trajectory recorded against an empty or older toolkit is decoded again with
 * the tools it actually refers to, so its tool calls and tool results regain
 * their exact names, parameters and results.
 */

import { Effect, JsonSchema, Match, Schema, Stream } from "effect";
import { Tool, Toolkit } from "effect/ai";
import * as Trajectory from "#/Trajectory.ts";
import * as Response from "#/Response.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * JSON Schema document in draft-07 form, the form tools are serialized as by
 * {@link encode}.
 *
 * @category models
 */
export type JsonSchemaDocument = JsonSchema.Document<"draft-07">;

/**
 * Serialized form of a single tool.
 *
 * **When to use**
 *
 * Use to persist a tool or describe it to a provider without its Effect
 * Schemas.
 *
 * **Details**
 *
 * The parameter, success and failure schemas are stored as draft-07 JSON Schema
 * documents, so a tool can be described and sent to a provider without the
 * Effect Schemas it was built from.
 *
 * @category models
 */
export type ToolEncoded = Readonly<{
  id: string;
  name: string;
  description?: string;
  parameters: JsonSchemaDocument;
  success: JsonSchemaDocument;
  failure: JsonSchemaDocument;
}>;

/**
 * Rebuilds a dynamic tool from its serialized form.
 *
 * **When to use**
 *
 * Use when a recorded tool call needs a tool to decode against after the
 * trajectory is loaded.
 *
 * **Details**
 *
 * Only the tool's name and parameter JSON Schema are carried over. The
 * description, success and failure schemas are dropped, so the rebuilt tool
 * takes unvalidated `unknown` parameters and reports `unknown` results, while
 * still advertising the parameter JSON Schema to the provider.
 *
 * @category converting
 */
export const toDynamic = ({ name, parameters }: ToolEncoded) =>
  Tool.dynamic(name, {
    parameters: parameters.schema,
  });

/**
 * Serialized form of a toolkit, keyed by the toolkit's tool keys.
 *
 * @category models
 */
export type ToolkitEncoded = Record<string, ToolEncoded>;

/**
 * Serializes a toolkit into a {@link ToolkitEncoded} record.
 *
 * **When to use**
 *
 * Use to persist a toolkit or pass its tool descriptions to a provider.
 *
 * **Details**
 *
 * Each tool contributes its id, name, optional description, and its parameter,
 * success and failure schemas converted to draft-07 JSON Schema documents.
 *
 * @category encoding
 */
export const encode = (toolkit: Toolkit.Any): ToolkitEncoded =>
  Object.fromEntries(
    Object.entries(toolkit.tools).map(([key, tool]) => {
      const encoded = {
        id: tool.id,
        name: tool.name,
        parameters: JsonSchema.toDocumentDraft07(
          JsonSchema.fromSchemaDraft2020_12(Tool.getJsonSchema(tool)),
        ),
        success: JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(tool.successSchema)),
        failure: JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(tool.failureSchema)),
      };

      return [
        key,
        tool.description === undefined ? encoded : { ...encoded, description: tool.description },
      ];
    }),
  );

/**
 * Extends a trajectory's toolkit with the given toolkits.
 *
 * **When to use**
 *
 * Use to bind a trajectory to the tools it refers to, such as one recorded with
 * `Toolkit.empty` or with an older version of the toolkit.
 *
 * **Details**
 *
 * Every part is encoded with the trajectory's own toolkit and decoded again with
 * the merged one, so tool calls and results that were recorded while their tools
 * were unknown gain their exact names, parameters and results. Anything no tool
 * matches stays unrestricted, prompt parts and metadata are carried over, and
 * schema failures are reported as {@link TrajectoryError}.
 *
 * **Example** (Binding a recorded trajectory to its tools)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Tool, Toolkit } from "effect/ai"
 * import { Response, Trajectory, Toolkit as TrajectoryToolkit } from "trajs"
 *
 * const weather = Toolkit.make(
 *   Tool.make("get_weather", { parameters: Schema.Struct({ city: Schema.String }) })
 * )
 *
 * const recorded = Trajectory.make(
 *   Stream.make(Trajectory.responsePart(Response.anyToolCallPart({
 *     id: "call_1", name: "get_weather", params: { city: "SF" }, providerExecuted: false
 *   }))),
 *   Toolkit.empty
 * )
 *
 * const rebound = await Effect.runPromise(TrajectoryToolkit.toolkits(weather)(recorded))
 * Object.keys(rebound.toolkit.tools) // => ["get_weather"]
 * ```
 *
 * @category combinators
 */
export const toolkits = <Toolkits extends ReadonlyArray<Toolkit.Any>>(...toolkits: Toolkits) =>
  Effect.fn(function* <Tools extends Record<string, Tool.Any>>(
    trajectory: Trajectory.Trajectory<Tools>,
  ) {
    const { toolkit, metadata } = trajectory;

    const merged = Toolkit.merge(toolkit, ...toolkits);

    const sourceSchema = Response.PartView(toolkit);
    const targetSchema = Response.PartView(merged);
    const encode = Schema.encodeEffect(sourceSchema);
    const decode = Schema.decodeEffect(targetSchema);

    const trajPart = Trajectory.Part(merged);

    const parts = trajectory.pipe(
      Stream.mapEffect((part) =>
        Match.value(part).pipe(
          Match.tag("Prompt", (prompt) => Effect.succeed(trajPart.make(prompt))),
          Match.tag("Response", (response) =>
            Effect.gen(function* () {
              const encoded = yield* encode(response.response).pipe(
                Effect.mapError(TrajectoryError.encode(toolkit)),
              );
              const decoded = yield* decode(encoded).pipe(
                Effect.mapError(TrajectoryError.decode(merged)),
              );
              return trajPart.make({ ...response, response: decoded });
            }),
          ),
          Match.exhaustive,
        ),
      ),
    );

    return Trajectory.make(parts, merged, metadata);
  });
