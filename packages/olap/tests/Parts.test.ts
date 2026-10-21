/**
 * The parts table as a program writes it and reads it back: what a trajectory's
 * parts are as rows, and what the embedded ClickHouse answers of them.
 *
 * The trajectory is built here rather than read from a `.trajs` file, since what
 * is exercised is the row a part becomes and the query a table of them answers,
 * not the bytes a trajectory is kept in.
 */

import {
  Event,
  EventKit,
  ExtraKit,
  Metric,
  MetricKit,
  Prompt,
  Response,
  Toolkit,
  Trajectory,
  VersionedSchema,
} from "@trajs/core";
import { DateTime, Effect, Schema, Stream } from "effect";
import { expect, it } from "vite-plus/test";

import { Client, layerEmbedded } from "#/Clickhouse.ts";
import * as Parts from "#/Parts.ts";

/** The session the trajectory runs in. */
const session = "01890a5d-ac96-774b-bcce-b302099a8057";

/** No extra data is declared, since none of it is stated of the parts below. */
const extrakit = ExtraKit.empty;

/** The kits the trajectory is built with: no tools, no events, and whole response parts. */
const config = Trajectory.config({
  stream: false,
  toolkit: Toolkit.empty,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit,
});

/** The builders of the parts below, under the config they are read with. */
const part = Trajectory.parts(config);

/** When the conversation was produced, so the moment a row states is one a test can state. */
const at = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");

/** The parts of a short conversation, in the one order a trajectory carries them in. */
const parts = [
  part.session(session),
  part.prompt(Prompt.make("what is the weather in SF"), {
    sessionId: session,
    timestamp: at,
  }),
  part.response(
    Response.anyToolCallPart({
      id: "call_1",
      name: "get_weather",
      params: { city: "SF" },
      providerExecuted: false,
    }),
    { sessionId: session, timestamp: at },
  ),
  part.response(
    Response.makePart("finish", {
      reason: "tool-calls",
      usage: new Response.Usage({
        inputTokens: { total: 11 },
        outputTokens: { total: 7 },
      }),
    }),
    { sessionId: session, timestamp: at },
  ),
];

/** The trajectory those parts make, as an ingest is given one. */
const trajectory = Trajectory.make(config)(Stream.fromIterable(parts));

/** What a program on Node runs the embedded engine and the exchange through. */
const Embedded = layerEmbedded();

it("states a part as the row it is stored as", async () => {
  const rows = Array.from(
    await Parts.rows("digest")(trajectory).pipe(Stream.runCollect, Effect.runPromise),
  );

  expect(
    rows.map((row) => [
      row.position,
      row.tag,
      row.variant,
      row.session_id,
      row.uuid === null,
      row.time,
    ]),
  ).toEqual([
    [0, "Session", "", session, false, null],
    [1, "Prompt", "", session, false, "2026-01-01T00:00:00.000Z"],
    [2, "Response", "tool-call", session, false, "2026-01-01T00:00:00.000Z"],
    [3, "Response", "finish", session, false, "2026-01-01T00:00:00.000Z"],
  ]);

  expect(rows[3]?.part._tag).toBe("Response");
  expect(rows[3]?.part).toMatchObject({ response: { type: "finish" } });
});

it("states what an event and a metric name, and the session a metric does not state", async () => {
  const step = new Event.Event({
    package: "test",
    id: "step",
    metadata: new Event.Metadata({ name: "Step" }),
    schema: Schema.Struct({ version: Schema.Literal("0.1.0"), index: Schema.Number }).pipe(
      VersionedSchema.make,
    ),
  });

  const measured = new Metric.Metric({
    package: "test",
    id: "tokens",
    metadata: new Metric.Metadata({ name: "Tokens" }),
    output: Schema.Struct({ version: Schema.Literal("0.1.0"), total: Schema.Number }).pipe(
      VersionedSchema.make,
    ),
    failure: Schema.Struct({ version: Schema.Literal("0.1.0") }).pipe(VersionedSchema.make),
  });

  const eventkit = EventKit.make(step);
  const metrickit = MetricKit.make(measured);

  // What the trajectory that holds them is read with, and the parts of it built under it.
  const kitted = Trajectory.config({ ...config, eventkit, metrickit });
  const described = Trajectory.parts(kitted);

  const eventPart = described.event(
    Event.EventPart(step.tag, step.schema).make({ data: { version: "0.1.0", index: 1 } }),
    { sessionId: session, timestamp: at },
  );

  // A metric part is what a producer of its metric reported, read through the kit
  // that names the metric — so the part is produced rather than written out.
  const reports = Array.from(
    await Metric.produce(
      MetricKit.toProducers(metrickit, {
        "test/tokens": () =>
          Stream.make(
            Metric.makeOutput<typeof measured>(
              { version: "0.1.0", total: 3 },
              { attach: [eventPart.uuid] },
            ),
          ),
      }),
    )(Trajectory.make(config)(Stream.empty)).pipe(Stream.runCollect, Effect.runPromise),
  );

  const metricPart = described.metric(reports[0]!, { timestamp: at });

  const trajectory = Trajectory.make(kitted)(Stream.fromIterable([eventPart, metricPart]));

  const rows = Array.from(
    await Parts.rows("digest")(trajectory).pipe(Stream.runCollect, Effect.runPromise),
  );

  expect(
    rows.map((row) => [row.tag, row.variant, row.session_id, row.uuid === null, row.time]),
  ).toEqual([
    ["Event", "test/step", session, false, "2026-01-01T00:00:00.000Z"],
    ["Metric", "test/tokens", "", true, "2026-01-01T00:00:00.000Z"],
  ]);

  expect(rows[1]?.part).toMatchObject({ metric: { data: { output: { total: 3 } } } });
});

it("answers a query over the rows a trajectory was written as", async () => {
  const answers = await Effect.gen(function* () {
    yield* Parts.create();
    const written = yield* Parts.ingest("digest")(trajectory);
    const ch = yield* Client;

    const tokens = yield* ch`
      SELECT sum(part.\`response.usage.inputTokens.total\`) AS input
      FROM parts
      WHERE digest = 'digest' AND variant = 'finish'
    `;

    const tools = yield* ch`
      SELECT part.\`response.name\` AS tool, count() AS calls
      FROM parts
      WHERE digest = 'digest' AND variant = 'tool-call'
      GROUP BY tool
    `;

    return { written, tokens: Array.from(tokens), tools: Array.from(tools) };
  }).pipe(Effect.provide(Embedded), Effect.runPromise);

  expect(answers.written).toBe(parts.length);
  expect(answers.tokens).toEqual([{ input: 11 }]);
  expect(answers.tools).toEqual([{ tool: "get_weather", calls: 1 }]);
});
