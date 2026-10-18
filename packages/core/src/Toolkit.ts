/**
 * A toolkit as a trajectory's header describes it, and the tool turns of a trajectory.
 *
 * {@link encode} writes a toolkit as the JSON objects of {@link ToolkitEncoded}, so a
 * trajectory names the tools its responses refer to without their Effect Schemas, and
 * {@link toolTurns} reads a trajectory as the calls it made with those tools and the
 * results each call was answered with. The rest of `effect/ai/Toolkit` is re-exported.
 */

import { JsonSchema, Schema, Stream } from "effect";
import { Tool, type Toolkit } from "effect/ai";

import type * as Response from "#/Response.ts";
import type * as Trajectory from "#/Trajectory.ts";

export * from "effect/ai/Toolkit";

/** A tool schema as a JSON Schema draft-07 document. */
export type JsonSchemaDocument = JsonSchema.Document<"draft-07">;

/** One tool as a trajectory's header describes it. */
export type ToolEncoded = Readonly<{
  id: string;
  name: string;
  description?: string;
  parameters: JsonSchemaDocument;
  success: JsonSchemaDocument;
  failure: JsonSchemaDocument;
}>;

/** A toolkit as a trajectory's header describes it, keyed by the key each tool is held at. */
export type ToolkitEncoded = Record<string, ToolEncoded>;

/** Encodes a toolkit as the descriptions a trajectory's header carries. */
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

/** The type of {@link empty}: a toolkit that holds no tool. */
export type Empty = typeof Toolkit.empty;

/**
 * One tool turn of a trajectory: a tool a model called, and the result that call was
 * answered with.
 *
 * **When to use**
 *
 * Use to type a tool turn read from a trajectory — what {@link toolTurns} emits — such as
 * to read what a run asked of its tools, one call at a time.
 *
 * **Details**
 *
 * The two parts are read the way every part of a trajectory is: through the toolkit, so a
 * call or a result of a tool the toolkit does not describe reads as the part the
 * trajectory holds rather than failing to read at all — see
 * {@link Response.ToolCallPartsView}.
 *
 * @see {@link toolTurns} for the reader that emits one tool turn per call.
 * @category models
 */
export type ToolTurn<Tools extends Record<string, Tool.Any>> = Readonly<{
  call: Response.ToolCallPartsView<Tools>;
  result: Response.ToolResultPartsView<Tools>;
}>;

/**
 * Reads a trajectory as the tool turns it holds: every tool a model called, with the
 * result that call was answered with.
 *
 * **When to use**
 *
 * Use to read a trajectory for what it did with its tools rather than for the conversation
 * it had: to score a run by the tools it used, to find the calls a model made over and
 * over, or to display each call beside what its tool returned. A trajectory read as the
 * conversation instead is what `View.promptTurns` emits.
 *
 * **Details**
 *
 * - A tool turn is emitted where the result that answers a call arrives, which is the
 *   result whose `id` is the call's.
 * - A preliminary result is the progress of a call rather than the answer to it and is
 *   read past, so the result of a tool turn is the final one.
 * - A call a trajectory holds no such result for is not a tool turn, and neither is a
 *   result whose call it does not hold: a trajectory that ends while a tool still runs
 *   holds the call alone, and a result no call of this reading was made for has nothing
 *   to pair it with.
 * - The turns are emitted in the order the calls were answered, which is the order the
 *   calls were made in a trajectory that answers each one as it runs, and a call is held
 *   only until then, so the trajectory is read once rather than held whole.
 * - Only the parts that carry a tool call or a tool result are read: the increments a
 *   streamed response arrived in, and the text and reasoning a model answered with, are
 *   read past.
 *
 * The stream fails with the trajectory's failure — `E` — and requires the services `R`
 * names.
 *
 * **Example** (Reading a trajectory as its tool turns)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Extra, Response, Toolkit, Trajectory } from "@trajs/core"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const extrakit = Extra.makeKit()
 * const response = Trajectory.ResponsePart({ toolkit: Toolkit.empty, extrakit, stream: false })
 *
 * // A trajectory of one call: the tool a model called, and the result it was answered with.
 * const trajectory = Stream.make(
 *   response.make({
 *     response: Response.anyToolCallPart({
 *       id: "call_1",
 *       name: "get_weather",
 *       params: { city: "Paris" },
 *       providerExecuted: false
 *     }),
 *     sessionId,
 *     extra: {}
 *   }),
 *   response.make({
 *     response: Response.anyToolResultPart({
 *       id: "call_1",
 *       name: "get_weather",
 *       isFailure: false,
 *       result: "sunny",
 *       providerExecuted: false
 *     }),
 *     sessionId,
 *     extra: {}
 *   })
 * )
 *
 * const turns = await Effect.runPromise(Stream.runCollect(Toolkit.toolTurns(trajectory)))
 *
 * Array.from(turns).map((turn) => [turn.call.name, turn.result.result]) // => [["get_weather", "sunny"]]
 * ```
 *
 * @see {@link ToolTurn} for the turn it emits.
 * @category combinators
 */
export const toolTurns = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config["toolkit"]["tools"]>, E, R> =>
  trajectory.pipe(
    Stream.mapAccum(
      // What ties the two parts of a tool turn together is the id both carry, so a call is
      // held from where it is read to where the result that answers it is.
      () => new Map<string, Response.ToolCallPartsView<Config["toolkit"]["tools"]>>(),
      (calls, part) => {
        if (part._tag !== "Response") return [calls, []];

        const response = part.response;

        switch (response.type) {
          case "tool-call":
            calls.set(response.id, response);

            return [calls, []];
          case "tool-result": {
            if (response.preliminary) return [calls, []];

            const call = calls.get(response.id);

            if (call === undefined) return [calls, []];

            calls.delete(response.id);

            return [calls, [{ call, result: response }]];
          }

          default:
            return [calls, []];
        }
      },
    ),
  );
