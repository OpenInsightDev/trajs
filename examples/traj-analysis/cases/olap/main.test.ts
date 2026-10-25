import { NodeServices as PlatformNodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Exchange, Storage } from "@trajs/core";
import { Clickhouse } from "@trajs/olap";
import { NodeServices } from "@trajs/platform-node";
import { Effect, Layer } from "effect";

import { generation, meanOf, writeFixtures } from "./fixture.ts";
import { importFixtures, prepareTable } from "./table.ts";

interface Tool {
  readonly tool: string;
  readonly calls: number;
  readonly share: number;
}

interface Model {
  readonly model: string;
  readonly responses: number;
  readonly share: number;
}

interface Day {
  readonly day: string;
  readonly trajectories: number;
  readonly tokens: number;
}

interface Analysis {
  readonly rows: number;

  readonly tools: ReadonlyArray<Tool>;

  readonly models: ReadonlyArray<Model>;

  readonly tokens: { readonly input: number; readonly output: number };

  readonly promptsPerSession: number;

  readonly subAgentShare: number;

  readonly days: ReadonlyArray<Day>;
}

interface Report {
  readonly written: number;
  readonly analysis: Analysis;
}

const storage = Layer.merge(NodeServices.layer(), Storage.layerFileSystem);

const Layers = Layer.mergeAll(
  PlatformNodeServices.layer,
  Exchange.layer.pipe(Layer.provide(storage), Layer.provide(PlatformNodeServices.layer)),
  Clickhouse.layerEmbedded(),
);

const main = () =>
  Effect.gen(function* () {
    yield* prepareTable();

    const written = yield* writeFixtures();

    yield* importFixtures();

    const ch = yield* Clickhouse.Client;

    const [counted] = yield* ch<{ rows: number }>`
      SELECT toUInt32(count()) AS rows
      FROM parts
    `;

    const tools = yield* ch<Tool>`
      SELECT tool, calls, round(calls / sum(calls) OVER (), 4) AS share
      FROM (
        SELECT part.\`response.name\` AS tool, toUInt32(count()) AS calls
        FROM parts
        WHERE variant = 'tool-call'
        GROUP BY tool
      )
      ORDER BY calls DESC, tool
    `;

    const models = yield* ch<Model>`
      SELECT model, responses, round(responses / sum(responses) OVER (), 4) AS share
      FROM (
        SELECT part.\`response.modelId\` AS model, toUInt32(count()) AS responses
        FROM parts
        WHERE variant = 'response-metadata'
        GROUP BY model
      )
      ORDER BY responses DESC, model
    `;

    const [tokens] = yield* ch<{ input: number; output: number }>`
      SELECT
        round(avg(part.\`response.usage.inputTokens.total\`), 2) AS input,
        round(avg(part.\`response.usage.outputTokens.total\`), 2) AS output
      FROM parts
      WHERE variant = 'finish'
    `;

    const [sessions] = yield* ch<{ prompts: number }>`
      SELECT round(avg(prompts), 3) AS prompts
      FROM (
        SELECT trajectory_id, session_id, countIf(tag = 'Prompt') AS prompts
        FROM parts
        GROUP BY trajectory_id, session_id
      )
    `;

    const [subAgents] = yield* ch<{ share: number }>`
      SELECT round(countIf(sessions > 1) / count(), 4) AS share
      FROM (
        SELECT trajectory_id, uniqExact(session_id) AS sessions
        FROM parts
        GROUP BY trajectory_id
      )
    `;

    const days = yield* ch<Day>`
      SELECT
        toString(toDate(time)) AS day,
        toUInt32(uniqExact(trajectory_id)) AS trajectories,
        toUInt32(sum(part.\`response.usage.inputTokens.total\` + part.\`response.usage.outputTokens.total\`)) AS tokens
      FROM parts
      WHERE variant = 'finish' AND time IS NOT NULL
      GROUP BY day
      ORDER BY day
    `;

    return {
      written,
      analysis: {
        rows: counted?.rows ?? 0,
        tools,
        models,
        tokens: { input: tokens?.input ?? 0, output: tokens?.output ?? 0 },
        promptsPerSession: sessions?.prompts ?? 0,
        subAgentShare: subAgents?.share ?? 0,
        days,
      },
    } satisfies Report;
  }).pipe(Effect.scoped, Effect.provide(Layers));

const expectNear = (observed: number, expected: number, tolerance: number) =>
  expect(Math.abs(observed - expected)).toBeLessThan(tolerance);

const toolShare = (analysis: Analysis, tool: string): number =>
  analysis.tools.find((row) => row.tool === tool)?.share ?? 0;

const modelShare = (analysis: Analysis, model: string): number =>
  analysis.models.find((row) => row.model === model)?.share ?? 0;

it.effect("main", () =>
  Effect.gen(function* () {
    const { written, analysis } = yield* main();

    expect(analysis.rows).toBe(written);

    for (const [tool, weight] of Object.entries(generation.tools)) {
      expectNear(toolShare(analysis, tool), weight, 0.04);
    }

    for (const [model, weight] of Object.entries(generation.models)) {
      expectNear(modelShare(analysis, model), weight, 0.05);
    }

    expectNear(analysis.tokens.input, meanOf(generation.tokens.input), 3);
    expectNear(analysis.tokens.output, meanOf(generation.tokens.output), 2);

    expectNear(analysis.promptsPerSession, meanOf(generation.turns), 0.1);

    expectNear(analysis.subAgentShare, generation.subAgents, 0.05);

    expect(analysis.days).toHaveLength(generation.days);

    for (const day of analysis.days) {
      expect(day.trajectories).toBe(generation.trajectories / generation.days);
      expect(day.tokens).toBeGreaterThan(0);
    }
  }),
);
