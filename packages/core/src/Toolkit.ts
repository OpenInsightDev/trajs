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
 * import { Response, Trajectory, Toolkit as TrajectoryToolkit } from "@trajs/core"
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
    const { toolkit, metadata, extensions } = trajectory;

    const merged = Toolkit.merge(toolkit, ...toolkits);

    const sourceSchema = Response.PartView(toolkit);
    const targetSchema = Response.PartView(merged);
    const encode = Schema.encodeEffect(sourceSchema);
    const decode = Schema.decodeEffect(targetSchema);

    const trajPart = Trajectory.Part(merged, extensions);

    const parts = trajectory.pipe(
      Stream.mapEffect((part) =>
        Match.value(part).pipe(
          Match.tag("Prompt", (prompt) => Effect.succeed(trajPart.make(prompt))),
          Match.tag("Session", (session) => Effect.succeed(trajPart.make(session))),
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
          Match.tag("Extension", (extension) => Effect.succeed(extension)),
          Match.exhaustive,
        ),
      ),
    );

    return Trajectory.make(parts, merged, metadata, extensions);
  });

/**
 * A tool call together with the result it produced.
 *
 * **When to use**
 *
 * Use to read what a recorded session did with a tool, such as to display,
 * evaluate or replay its tool usage.
 *
 * **Details**
 *
 * The call and its result are narrowed to the toolkit entry they share, so a
 * turn's parameters and result carry the types of that tool.
 *
 * @see {@link toolTurns} for streaming the turns of a trajectory.
 * @category models
 */
export type ToolTurn<Tools extends Record<string, Tool.Any>> = {
  [Name in keyof Tools]: Name extends string
    ? Readonly<{
        call: Extract<Response.ToolCallParts<Tools>, { name: Name }>;

        result: Extract<Response.ToolResultParts<Tools>, { name: Name }>;
      }>
    : never;
}[keyof Tools];

/**
 * Pairs a tool call with the tool result that answers it.
 *
 * **When to use**
 *
 * Use when a tool result should be read through the types of the tool it
 * belongs to.
 *
 * **Details**
 *
 * Both parts must name the same tool, otherwise the pair is rejected with
 * `undefined`; the identifier of the result is left to the caller to check.
 *
 * @see {@link toolTurns} for pairing every turn of a trajectory.
 * @category constructors
 */
export const toolTurn = <Tools extends Record<string, Tool.Any>>(
  call: Response.ToolCallParts<Tools>,
  result: Response.ToolResultParts<Tools>,
): ToolTurn<Tools> | undefined => {
  if (call.name !== result.name) {
    return undefined;
  }
  // SAFETY: Equal tool names correlate both union members to the same toolkit entry.
  return { call, result } as ToolTurn<Tools>;
};

/**
 * Streams the tool turns of a trajectory.
 *
 * **When to use**
 *
 * Use to read the tool calls a recorded session made together with the results
 * they produced.
 *
 * **Details**
 *
 * A turn is emitted once the result of a recorded tool call is reached, so the
 * stream follows the order of the results. Results are read from response
 * parts, where the tools a model ran are recorded. Calls and results are
 * correlated by their identifier and must name the same tool. Preliminary
 * results report progress while a tool is still running, so only the final one
 * completes a turn, and a call whose result was never recorded stays pending
 * and is dropped. Parts that no tool of the toolkit matches are skipped,
 * because their parameters and results are not described by any schema; bind a
 * recording to its tools with {@link toolkits} to give those parts their exact
 * names, parameters and results.
 *
 * **Example** (Reading the tool turns of a recorded session)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Tool, Toolkit } from "effect/ai"
 * import { Response, Trajectory, Toolkit as TrajectoryToolkit } from "@trajs/core"
 *
 * const weather = Toolkit.make(
 *   Tool.make("get_weather", { parameters: Schema.Struct({ city: Schema.String }) })
 * )
 *
 * const call = Response.anyToolCallPart({
 *   id: "call_1", name: "get_weather", params: { city: "SF" }, providerExecuted: false
 * })
 * const result = Response.anyToolResultPart({
 *   id: "call_1", name: "get_weather", isFailure: false, result: { temp: 22 },
 *   encodedResult: { temp: 22 }, providerExecuted: false, preliminary: false
 * })
 *
 * const recorded = Trajectory.make(
 *   Stream.make(Trajectory.responsePart(call), Trajectory.responsePart(result)),
 *   Toolkit.empty
 * )
 *
 * const bound = await Effect.runPromise(TrajectoryToolkit.toolkits(weather)(recorded))
 * const turns = await Effect.runPromise(Stream.runCollect(TrajectoryToolkit.toolTurns(bound)))
 * turns.length // => 1
 * ```
 *
 * @see {@link toolkits} for binding a recording to the tools it refers to.
 * @category combinators
 */
export const toolTurns = <Tools extends Record<string, Tool.Any>>(
  trajectory: Trajectory.Trajectory<Tools>,
): Stream.Stream<ToolTurn<Tools>, TrajectoryError> =>
  trajectory.pipe(
    Stream.mapAccum(
      () => new Map<string, Response.ToolCallParts<Tools>>(),
      (calls, part) => {
        if (part._tag !== "Response") {
          return [calls, []] as const;
        }

        const response = part.response;

        if (Response.isAnyToolPart(response)) {
          return [calls, []] as const;
        }

        if (response.type === "tool-call") {
          // SAFETY: A part that no `AnyTool*Part` branded is described by the toolkit, so its name is one of the toolkit's keys.
          const call = response as Response.ToolCallParts<Tools>;

          return [new Map(calls).set(call.id, call), []] as const;
        }

        if (response.type !== "tool-result" || response.preliminary) {
          return [calls, []] as const;
        }

        // SAFETY: A part that no `AnyTool*Part` branded is described by the toolkit, so its name is one of the toolkit's keys.
        const result = response as Response.ToolResultParts<Tools>;
        const call = calls.get(result.id);

        if (call === undefined) {
          return [calls, []] as const;
        }

        const pending = new Map(calls);
        pending.delete(result.id);

        const turn = toolTurn(call, result);

        return [pending, turn === undefined ? [] : [turn]] as const;
      },
    ),
  );
