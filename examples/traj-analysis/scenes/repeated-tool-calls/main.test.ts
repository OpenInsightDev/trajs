import { expect, it } from "@effect/vitest";
import { Cache, Prompt, Response, Session, Trajectory, View } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Stream } from "effect";

const config = Config.config({ stream: false });

interface RepeatedToolCall {
  readonly name: string;
  readonly params: unknown;
  readonly ids: ReadonlyArray<string>;
}

interface Report {
  readonly totalToolTurns: number;
  readonly repeated: ReadonlyArray<RepeatedToolCall>;
}

const part = Trajectory.parts(config);

const prompt = (text: string) => part.prompt(Prompt.make(text));

const toolTurn = (id: string, name: string, params: Record<string, string>, answer: string) => [
  part.response(Response.anyToolCallPart({ id, name, params })),
  part.response(
    Response.anyToolResultPart({
      id,
      name,
      isFailure: false,
      result: answer,
    }),
  ),
];

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
  const session = yield* Session.main(trajectory);

  return yield* session.stream.pipe(
    // View.toolTurns pairs a call with its result.
    View.toolTurns,

    // A new call id does not split the group. The key is name and params.
    Stream.groupAdjacentBy(({ call: { name, params } }) => ({ name, params })),

    Stream.runFold(
      (): Report => ({ totalToolTurns: 0, repeated: [] }),
      (report, [{ name, params }, run]) => ({
        totalToolTurns: report.totalToolTurns + run.length,

        // At 2, two identical reads are not a repeat.
        repeated:
          run.length > threshold
            ? [...report.repeated, { name, params, ids: run.map(({ call }) => call.id) }]
            : report.repeated,
      }),
    ),
  );
});

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
    Effect.provide(Cache.layer()),
  ),
);
