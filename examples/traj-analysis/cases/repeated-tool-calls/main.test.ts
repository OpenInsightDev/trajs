/**
 * An agent stuck on a tool: the same call, made with the same input, over and over.
 *
 * The trajectory is read as the tool turns it holds — every call, with the result that call
 * was answered with — and the calls made one after another with the same input are grouped
 * into a run: a run longer than the threshold the trajectory is read with is reported as a
 * repeat. What makes two calls the same call is `Equal.equals` of their inputs, so the
 * comparison is by structure — a call made again is a repeat even though the trajectory
 * holds another part, with another id.
 *
 * The trajectory is built here rather than read from a `.trajs` file so the case stands on
 * its own; a real analysis reads the same parts with `Exchange`.
 */

import { Extra, Prompt, Response, Toolkit, Trajectory } from "@trajs/core";
import { Effect, Stream } from "effect";
import { expect, it } from "vite-plus/test";

const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057";

const extrakit = Extra.makeKit();

const response = Trajectory.ResponsePart({ toolkit: Toolkit.empty, extrakit, stream: false });

/** A call a model made again and again. */
interface RepeatedCall {
  readonly name: string;
  readonly params: unknown;
  readonly ids: ReadonlyArray<string>;
}

/** What the analysis reports. */
interface Report {
  readonly toolTurns: number;
  readonly repeated: ReadonlyArray<RepeatedCall>;
}

const prompt = (text: string) =>
  Trajectory.promptPart(extrakit)({ prompt: Prompt.make(text), sessionId });

/** One tool turn of the sample: the call, and the result that names it by the same id. */
const toolTurn = (id: string, name: string, params: Record<string, string>, answer: string) => [
  response.make({
    response: Response.anyToolCallPart({ id, name, params, providerExecuted: false }),
    sessionId,
    extra: {},
  }),
  response.make({
    response: Response.anyToolResultPart({
      id,
      name,
      isFailure: false,
      result: answer,
      providerExecuted: false,
    }),
    sessionId,
    extra: {},
  }),
];

// A trajectory is a stream of parts and a stream is read once, so the sample is built on
// each call and read by the one call that asks for it.
const sample = () =>
  Stream.fromArray([
    prompt("Where is `parseConfig` defined?"),
    ...toolTurn("call_1", "grep", { pattern: "parseConfig" }, "src/config.ts:12"),
    ...toolTurn("call_2", "grep", { pattern: "parseConfig" }, "src/config.ts:12"),
    ...toolTurn("call_3", "grep", { pattern: "parseConfig" }, "src/config.ts:12"),
    prompt("Read the module it is defined in."),
    ...toolTurn("call_4", "read_file", { path: "src/config.ts" }, "export const parseConfig = 1"),
    ...toolTurn("call_5", "read_file", { path: "src/config.ts" }, "export const parseConfig = 1"),
    prompt("Run the tests."),
    ...toolTurn("call_6", "bash", { command: "bun test" }, "3 tests passed"),
    ...toolTurn("call_7", "bash", { command: "bun test" }, "3 tests passed"),
    ...toolTurn("call_8", "bash", { command: "bun test" }, "3 tests passed"),
  ]);

/**
 * Reads a trajectory as the report on its repeated tool calls, in one pass: the tool turns
 * are gathered into runs as they arrive, and a run is folded into the report as it closes.
 */
const main = (threshold: number): Promise<Report> =>
  sample().pipe(
    Toolkit.toolTurns,
    // Calls made with equal inputs are one run: `groupAdjacentBy` compares the inputs with
    // `Equal.equals`, so two calls of one input are one call, whatever their ids.
    Stream.groupAdjacentBy((turn) => ({ name: turn.call.name, params: turn.call.params })),
    Stream.runFold(
      (): Report => ({ toolTurns: 0, repeated: [] }),
      (report, [input, run]) => ({
        toolTurns: report.toolTurns + run.length,
        repeated:
          run.length > threshold
            ? [...report.repeated, { ...input, ids: run.map((turn) => turn.call.id) }]
            : report.repeated,
      }),
    ),
    Effect.runPromise,
  );

it("main", async () => {
  // Three `grep` calls of one pattern in a row, and three `bash` calls of one command in a
  // row, are the repeats. The two `read_file` calls of one path are a run of two, which is
  // not longer than the threshold the trajectory is read with, so they do not repeat.
  await expect(main(2)).resolves.toEqual({
    toolTurns: 8,
    repeated: [
      { name: "grep", params: { pattern: "parseConfig" }, ids: ["call_1", "call_2", "call_3"] },
      { name: "bash", params: { command: "bun test" }, ids: ["call_6", "call_7", "call_8"] },
    ],
  });
});
