import { NodeServices as PlatformNodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Exchange, Storage } from "@trajs/core";
import { Clickhouse } from "@trajs/olap";
import { NodeServices } from "@trajs/platform-node";
import { Effect, Layer } from "effect";

import { generation, meanOf, writeFixtures } from "./fixture.ts";
import { importFixtures, prepareTable } from "./table.ts";

interface Tool {
  readonly name: string;
  readonly calls: number;
  readonly share: number;
}

interface Model {
  readonly modelId: string;
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

  readonly tokens: { readonly inputTokens: number; readonly outputTokens: number };

  readonly promptsPerSession: number;

  readonly subSessionShare: number;

  readonly days: ReadonlyArray<Day>;
}

interface Summary {
  readonly written: number;
  readonly analysis: Analysis;
}

const storage = Layer.merge(NodeServices.layer, Storage.layerFileSystem);

const Layers = Layer.mergeAll(
  PlatformNodeServices.layer,
  Exchange.layer.pipe(Layer.provide(storage), Layer.provide(PlatformNodeServices.layer)),
  // Clickhouse.layerEmbedded runs chdb in this process. No server is contacted.
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

    // variant holds tool-call, finish, or response-metadata.
    // tag holds Prompt, Response, and the other part kinds.
    // A dotted part path reads one field of the JSON payload.
    const tools = yield* ch<Tool>`
      SELECT name, calls, round(calls / sum(calls) OVER (), 4) AS share
      FROM (
        SELECT part.\`response.name\` AS name, toUInt32(count()) AS calls
        FROM parts
        WHERE variant = 'tool-call'
        GROUP BY name
      )
      ORDER BY calls DESC, name
    `;

    const models = yield* ch<Model>`
      SELECT modelId, responses, round(responses / sum(responses) OVER (), 4) AS share
      FROM (
        SELECT part.\`response.modelId\` AS modelId, toUInt32(count()) AS responses
        FROM parts
        WHERE variant = 'response-metadata'
        GROUP BY modelId
      )
      ORDER BY responses DESC, modelId
    `;

    const [tokens] = yield* ch<{ inputTokens: number; outputTokens: number }>`
      SELECT
        round(avg(part.\`response.usage.inputTokens.total\`), 2) AS inputTokens,
        round(avg(part.\`response.usage.outputTokens.total\`), 2) AS outputTokens
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

    const [subSessions] = yield* ch<{ share: number }>`
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
        tokens: {
          inputTokens: tokens?.inputTokens ?? 0,
          outputTokens: tokens?.outputTokens ?? 0,
        },
        promptsPerSession: sessions?.prompts ?? 0,
        subSessionShare: subSessions?.share ?? 0,
        days,
      },
    } satisfies Summary;
  }).pipe(Effect.scoped, Effect.provide(Layers));

const expectNear = (observed: number, expected: number, tolerance: number) =>
  expect(Math.abs(observed - expected)).toBeLessThan(tolerance);

const toolShare = (analysis: Analysis, name: string): number =>
  analysis.tools.find((row) => row.name === name)?.share ?? 0;

const modelShare = (analysis: Analysis, modelId: string): number =>
  analysis.models.find((row) => row.modelId === modelId)?.share ?? 0;

it.effect("main", () =>
  Effect.gen(function* () {
    const { written, analysis } = yield* main();

    expect(analysis.rows).toBe(written);

    for (const [name, weight] of Object.entries(generation.tools)) {
      expectNear(toolShare(analysis, name), weight, 0.04);
    }

    for (const [modelId, weight] of Object.entries(generation.models)) {
      expectNear(modelShare(analysis, modelId), weight, 0.05);
    }

    expectNear(analysis.tokens.inputTokens, meanOf(generation.tokens.inputTokens), 3);
    expectNear(analysis.tokens.outputTokens, meanOf(generation.tokens.outputTokens), 2);

    expectNear(analysis.promptsPerSession, meanOf(generation.prompts), 0.1);

    expectNear(analysis.subSessionShare, generation.subSessions, 0.05);

    expect(analysis.days).toHaveLength(generation.days);

    for (const day of analysis.days) {
      expect(day.trajectories).toBe(generation.trajectories / generation.days);
      expect(day.tokens).toBeGreaterThan(0);
    }
  }),
);
