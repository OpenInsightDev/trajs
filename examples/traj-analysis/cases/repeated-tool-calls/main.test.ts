/**
 * An agent stuck on a tool: the same call, made with the same input, over and over.
 *
 * The parts of one session are read as the tool turns they were answered in, and the calls
 * made one after another with the same input are reported as one repeat.
 *
 * The parts are built here rather than read from a `.trajs` file so the case stands on its
 * own; a real analysis reads the same parts as the `stream` of a session
 * `Session.toSessions` read of a trajectory an `Exchange` loaded.
 */

import { expect, it } from "@effect/vitest";
import { Prompt, Response, Session, Trajectory, View } from "@trajs/core";
import { Effect, Option, Stream } from "effect";

/** What the parts are built and read with: no tool, event, metric or extra datum. */
const config = Trajectory.config({ stream: false });

/** A call reported as repeated: its input, and the ids of the calls made with it. */
interface RepeatedToolCall {
  readonly name: string;
  readonly params: unknown;
  readonly ids: ReadonlyArray<string>;
}

/** The tool turns read in all, and the calls repeated among them. */
interface Report {
  readonly totalToolTurns: number;
  readonly repeated: ReadonlyArray<RepeatedToolCall>;
}

const part = Trajectory.parts(config);

const prompt = (text: string) => part.prompt(Prompt.make(text));

const toolTurn = (id: string, name: string, params: Record<string, string>, answer: string) => [
  part.response(Response.anyToolCallPart({ id, name, params, providerExecuted: false })),
  part.response(
    Response.anyToolResultPart({
      id,
      name,
      isFailure: false,
      result: answer,
      providerExecuted: false,
    }),
  ),
];

/** What the trajectory holds: what one session's model was given and answered. */
const trajectory = Trajectory.make(config)(
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
  ]),
);

const main = Effect.fn(function* (threshold: number) {
  const sessions = yield* Session.toSessions(trajectory);
  const session = Option.getOrThrow(Session.session(Trajectory.rootSession)(sessions));

  return yield* session.stream.pipe(
    // Parts to turns: a call with the result that answered it
    View.toolTurns,
    // Turns to runs: the calls made one after another with equal inputs, compared with
    // `Equal.equals`, so two calls of one input are one run whatever ids they carry.
    Stream.groupAdjacentBy(({ call: { name, params } }) => ({ name, params })),
    // Runs to the report: folded as they arrive rather than collected first, so the parts are
    // read in one pass.
    Stream.runFold(
      (): Report => ({ totalToolTurns: 0, repeated: [] }),
      (report, [input, run]) => ({
        // Every turn counts, whether or not the run it belongs to repeats.
        totalToolTurns: report.totalToolTurns + run.length,
        // A repeat names what its calls shared and which calls made it: the input of the run,
        // and the id of each call.
        repeated:
          run.length > threshold
            ? [...report.repeated, { ...input, ids: run.map(({ call }) => call.id) }]
            : report.repeated,
      }),
    ),
  );
});

// Three `grep` calls of one pattern in a row and three `bash` calls of one command in a row
// are repeats; the two `read_file` calls of one path are a run of two, which is not longer
// than the threshold the analysis is read with, so they are not reported.
it.effect("main", () =>
  main(2).pipe(
    Effect.map((report) =>
      expect(report).toEqual({
        totalToolTurns: 8,
        repeated: [
          { name: "grep", params: { pattern: "parseConfig" }, ids: ["call_1", "call_2", "call_3"] },
          { name: "bash", params: { command: "bun test" }, ids: ["call_6", "call_7", "call_8"] },
        ],
      }),
    ),
  ),
);
