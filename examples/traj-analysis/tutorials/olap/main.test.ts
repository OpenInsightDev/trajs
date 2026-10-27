import { expect, it } from "@effect/vitest";
import { Prompt, Response, Trajectory } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Clickhouse, Parts } from "@trajs/olap";
import { Effect, Stream } from "effect";

const config = Config.config();

const part = Trajectory.parts(config);

interface Tool {
  readonly tool: string;
  readonly calls: number;
}

interface Run {
  readonly trajectory: string;
  readonly input: number;
  readonly output: number;
}

interface Report {
  /** The rows the two runs became. */
  readonly written: number;

  /** The rows the table holds for them. */
  readonly rows: number;

  readonly tools: ReadonlyArray<Tool>;

  readonly runs: ReadonlyArray<Run>;
}

const called = (id: string, name: string, params: Record<string, string>) =>
  part.response(Response.anyToolCallPart({ id, name, params }));

const finished = (reason: Response.FinishReason, input: number, output: number) =>
  part.response(
    Response.makePart("finish", {
      reason,
      usage: new Response.Usage({
        inputTokens: { total: input },
        outputTokens: { total: output },
      }),
    }),
  );

const lookup = Trajectory.make(
  "tutorial-run-1",
  config,
)(
  Stream.fromArray([
    part.prompt(Prompt.make("Where is `parseConfig` defined?")),
    called("call_1", "grep", { pattern: "parseConfig" }),
    finished("tool-calls", 120, 30),
    part.prompt(Prompt.make("Read the module it is defined in.")),
    called("call_2", "read_file", { path: "src/config.ts" }),
    finished("stop", 180, 45),
  ]),
);

const tests = Trajectory.make(
  "tutorial-run-2",
  config,
)(
  Stream.fromArray([
    part.prompt(Prompt.make("Run the test suite.")),
    called("call_3", "bash", { command: "bun test" }),
    finished("tool-calls", 90, 20),
    part.prompt(Prompt.make("Run it again with the failing file alone.")),
    called("call_4", "bash", { command: "bun test src/config.test.ts" }),
    finished("stop", 80, 15),
  ]),
);

const main = Effect.gen(function* () {
  yield* Parts.create();

  const written = (yield* Parts.ingest(lookup)) + (yield* Parts.ingest(tests));

  // The ids the runs were made with name their rows, so a query over them
  // leaves the rows of other trajectories alone.
  const ids = [lookup.id, tests.id];

  const ch = yield* Clickhouse.Client;

  const [counted] = yield* ch<{ rows: number }>`
    SELECT toUInt32(count()) AS rows
    FROM parts
    WHERE trajectory_id IN (${ids[0]}, ${ids[1]})
  `;

  const tools = yield* ch<Tool>`
    SELECT part.\`response.name\` AS tool, toUInt32(count()) AS calls
    FROM parts
    WHERE variant = 'tool-call' AND trajectory_id IN (${ids[0]}, ${ids[1]})
    GROUP BY tool
    ORDER BY calls DESC, tool
  `;

  const runs = yield* ch<Run>`
    SELECT
      trajectory_id AS trajectory,
      toUInt32(sum(part.\`response.usage.inputTokens.total\`)) AS input,
      toUInt32(sum(part.\`response.usage.outputTokens.total\`)) AS output
    FROM parts
    WHERE variant = 'finish' AND trajectory_id IN (${ids[0]}, ${ids[1]})
    GROUP BY trajectory_id
    ORDER BY trajectory_id
  `;

  return { written, rows: counted?.rows ?? 0, tools, runs } satisfies Report;
}).pipe(Effect.provide(Clickhouse.layerEmbedded()));

it.effect("main", () =>
  Effect.map(main, (report) => {
    expect(report).toEqual({
      written: 12,
      rows: 12,

      tools: [
        { tool: "bash", calls: 2 },
        { tool: "grep", calls: 1 },
        { tool: "read_file", calls: 1 },
      ],

      runs: [
        { trajectory: "tutorial-run-1", input: 300, output: 75 },
        { trajectory: "tutorial-run-2", input: 170, output: 35 },
      ],
    } satisfies Report);
  }),
);
