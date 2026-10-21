/**
 * Trajectories as the rows an OLAP store aggregates them in: a fixture set generated
 * from known weights, imported into ClickHouse, and read back as those weights.
 *
 * The set is what a program's own trajectories look like on disk — hundreds of
 * `.trajs` files under `cases/olap/fixtures/trajs` — and it is generated rather than
 * recorded so that the answer is known in advance: an agent that calls `grep` half
 * the time, a model that answers six responses in ten, a turn that uses fifty tokens
 * on average. The analysis is then of the rows the parts became rather than of the
 * trajectories, so what `main` does after the import is ask the table those questions
 * in SQL — each one a grouping or an average of thousands of rows — and what the
 * assertions at the end do is compare the answers with the weights the fixtures were
 * drawn from, to within the scatter of a sample that size.
 *
 * What the fixtures are and how they are written is `fixture.ts`, and the table they are
 * imported into is `table.ts`.
 */

import { NodeServices as PlatformNodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Exchange } from "@trajs/core";
import { Clickhouse } from "@trajs/olap";
import { NodeServices } from "@trajs/platform-node";
import { layerFileSystem } from "@trajs/utils/Storage";
import { Effect, Layer } from "effect";

import { generation, meanOf, writeFixtures } from "./fixture.ts";
import { importFixtures, prepareTable } from "./table.ts";

/** A tool as the rows state it: how many calls named it, and the share of the calls that is. */
interface Tool {
  readonly tool: string;
  readonly calls: number;
  readonly share: number;
}

/** A model as the rows state it: how many responses it answered, and the share of the responses that is. */
interface Model {
  readonly model: string;
  readonly responses: number;
  readonly share: number;
}

/** A day as the rows state it: the trajectories produced in it, and the tokens they used. */
interface Day {
  readonly day: string;
  readonly trajectories: number;
  readonly tokens: number;
}

/** What the analysis answers of the rows the fixtures became. */
interface Analysis {
  /** The rows the table holds: one per part of every trajectory imported. */
  readonly rows: number;
  /** What each tool was called with, and how much of the calls that is. */
  readonly tools: ReadonlyArray<Tool>;
  /** What answered, and how much of the responses that is. */
  readonly models: ReadonlyArray<Model>;
  /** The tokens a response used on average, as the totals of its `finish` part state them. */
  readonly tokens: { readonly input: number; readonly output: number };
  /** The prompts a session was asked on average. */
  readonly promptsPerSession: number;
  /** The share of trajectories that declared more than one session, so started a sub-agent. */
  readonly subAgentShare: number;
  /** What each day of the fixture set holds. */
  readonly days: ReadonlyArray<Day>;
}

/** What the fixture set was, beside what the analysis read back of it. */
interface Report {
  /** The parts the fixtures held, which is the rows the import should have written. */
  readonly written: number;
  readonly analysis: Analysis;
}

/** The file system the fixtures are kept in, and the codecs that carry and name a trajectory. */
const storage = Layer.merge(NodeServices.layer(), layerFileSystem);

/**
 * What the program is made of: the file system of a Node program, the exchange
 * reading and writing the fixtures through the codecs of `@trajs/platform-node`,
 * and the ClickHouse engine `chdb` embeds in the process.
 */
const Layers = Layer.mergeAll(
  PlatformNodeServices.layer,
  Exchange.Exchange.layer.pipe(Layer.provide(storage), Layer.provide(PlatformNodeServices.layer)),
  Clickhouse.layerEmbedded(),
);

/** Generates the fixture set, imports every trajectory of it, and asks the table what it was drawn from. */
const main = () =>
  Effect.gen(function* () {
    yield* prepareTable();

    const written = yield* writeFixtures();

    yield* importFixtures();

    const ch = yield* Clickhouse.Client;

    // What the table holds: one row per part of every trajectory imported.
    const [counted] = yield* ch<{ rows: number }>`
      SELECT toUInt32(count()) AS rows
      FROM parts
    `;

    // What the agent did with its tools: the calls are grouped by the tool each named in its payload,
    // and a window sums the groups so that each share is read in one pass.
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

    // What answered: the model of a response is what its `response-metadata` part states, shared the
    // same way.
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

    // What a response used on average: the totals a `finish` part states, averaged over the responses
    // rather than over the rows.
    const [tokens] = yield* ch<{ input: number; output: number }>`
      SELECT
        round(avg(part.\`response.usage.inputTokens.total\`), 2) AS input,
        round(avg(part.\`response.usage.outputTokens.total\`), 2) AS output
      FROM parts
      WHERE variant = 'finish'
    `;

    // How many turns a session was asked on average: the prompts of a session are counted before they
    // are averaged, so the answer is prompts a session rather than prompts a row.
    const [sessions] = yield* ch<{ prompts: number }>`
      SELECT round(avg(prompts), 3) AS prompts
      FROM (
        SELECT session_id, countIf(tag = 'Prompt') AS prompts
        FROM parts
        GROUP BY session_id
      )
    `;

    // How often a run started a sub-agent: a trajectory that declared more than one session did.
    const [subAgents] = yield* ch<{ share: number }>`
      SELECT round(countIf(sessions > 1) / count(), 4) AS share
      FROM (
        SELECT digest, uniqExact(session_id) AS sessions
        FROM parts
        GROUP BY digest
      )
    `;

    // What each day cost: the responses finished that day, and the trajectories they were of. A
    // session part states no moment of its own, so the rows a day is read off are the rows that do.
    const days = yield* ch<Day>`
      SELECT
        toString(toDate(time)) AS day,
        toUInt32(uniqExact(digest)) AS trajectories,
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

/** Asserts that `observed` is within `tolerance` of `expected`, which is how a sample is compared with what it was drawn from. */
const expectNear = (observed: number, expected: number, tolerance: number) =>
  expect(Math.abs(observed - expected)).toBeLessThan(tolerance);

/** The share the analysis answered for `tool`, and none where it answered no row for it. */
const toolShare = (analysis: Analysis, tool: string): number =>
  analysis.tools.find((row) => row.tool === tool)?.share ?? 0;

/** The share the analysis answered for `model`, and none where it answered no row for it. */
const modelShare = (analysis: Analysis, model: string): number =>
  analysis.models.find((row) => row.model === model)?.share ?? 0;

it.effect("main", () =>
  Effect.gen(function* () {
    const { written, analysis } = yield* main();

    // Every part of every fixture is a row of the table, once: what the queries above aggregate over
    // is the parts the fixtures were written as, which is what makes the answers an analysis of them.
    expect(analysis.rows).toBe(written);

    // Every call names its tool in the payload and was drawn from these weights, so the share of the
    // calls a tool got is the weight it was drawn with, to within the scatter of ~1,300 calls.
    for (const [tool, weight] of Object.entries(generation.tools)) {
      expectNear(toolShare(analysis, tool), weight, 0.04);
    }

    // Every response states the model that answered it, drawn from these weights, so the share of the
    // responses a model answered is its weight, to within the scatter of ~1,300 responses.
    for (const [model, weight] of Object.entries(generation.models)) {
      expectNear(modelShare(analysis, model), weight, 0.05);
    }

    // A turn's totals are drawn from a range, so the average response used its midpoint — and the
    // average is of the responses rather than of the rows, so the totals are read off `finish` parts.
    expectNear(analysis.tokens.input, meanOf(generation.tokens.input), 3);
    expectNear(analysis.tokens.output, meanOf(generation.tokens.output), 2);

    // A session produces a number of turns drawn from a range, so the average session was asked the
    // range's midpoint number of prompts.
    expectNear(analysis.promptsPerSession, meanOf(generation.turns), 0.1);

    // A run starts a sub-agent with this probability, and what a sub-agent is in the table is a second
    // session declared in the trajectory of the run that started it.
    expectNear(analysis.subAgentShare, generation.subAgents, 0.05);

    // The runs were dealt to the days evenly rather than drawn to them, so every day holds the same
    // number of trajectories — each of which used some tokens on it.
    expect(analysis.days).toHaveLength(generation.days);

    for (const day of analysis.days) {
      expect(day.trajectories).toBe(generation.trajectories / generation.days);
      expect(day.tokens).toBeGreaterThan(0);
    }
  }),
);
