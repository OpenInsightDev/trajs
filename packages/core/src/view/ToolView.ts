/**
 * Tool calls of response parts, and the final results they are paired with.
 *
 * {@link toolCalls} reads the calls of a session and {@link toolTurns} pairs each one with
 * its result.
 *
 * @stability stable
 */

import { Predicate, Result, Stream } from "effect";

import type * as Config from "#/Config.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";

type Tools<Config extends Config.AnyConfig> = Config["toolkit"]["tools"];

/**
 * Selects tool calls from response parts in session order.
 *
 * **When to use**
 *
 * Use when unanswered calls must remain visible.
 *
 * **Details**
 *
 * Calls to undeclared tools are included.
 * Tool calls inside prompt messages are not inspected.
 *
 * @see {@link toolTurns} for pairing calls with final results.
 * @see {@link Response.ToolCallOf} for the emitted call type.
 * @stability stable
 * @category filtering
 */
export const toolCalls = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<Response.ToolCallOf<Config>, E, R> =>
  stream.pipe(
    Stream.filterMap((part) =>
      Predicate.isTagged("Response")(part) && part.response.type === "tool-call"
        ? Result.succeed(part.response)
        : Result.failVoid,
    ),
  );

/**
 * A response tool call paired with its final result by call id.
 *
 * @see {@link toolTurns} for pairing rules.
 * @stability stable
 * @category models
 */
export type ToolTurn<Config extends Config.AnyConfig> = Readonly<{
  call: Response.ToolCallOf<Config>;
  result: Response.ToolResultOf<Config>;
}>;

/**
 * Pairs response tool calls with final results in result-arrival order.
 *
 * **Details**
 *
 * Calls are remembered by id until a non-preliminary result arrives.
 * A matching final result emits one pair and removes the remembered call.
 *
 * **Gotchas**
 *
 * Preliminary results and results without a preceding call are omitted.
 * Reusing an unanswered call id replaces its earlier call.
 * Unanswered calls remain in memory until the input ends and emit no pair.
 * Prompt messages are not inspected for calls or results.
 *
 * @see {@link toolCalls} for calls without requiring results.
 * @see {@link ToolTurn} for the emitted pair.
 * @stability stable
 * @category transforming
 */
export const toolTurns = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config>, E, R> =>
  stream.pipe(
    Stream.mapAccum(
      () => new Map<string, Response.ToolCallPartsView<Tools<Config>>>(),
      (calls, part) => {
        if (!Predicate.isTagged("Response")(part)) return [calls, []];

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
