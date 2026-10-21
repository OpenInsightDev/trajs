/**
 * A run whose tools are the ones the trajectory was written with: each call read in the
 * terms its tool's parameters state, and folded into the report as it arrives rather than
 * collected into turns first.
 *
 * The parts are built of the config its responses were returned by — `config` below names it,
 * and `Trajectory.parts` states it on each part — so a response part is typed by the tool it
 * names: `get_weather` holds a city, `search_docs` a query and a page size, `read_file` a
 * path. That is what a toolkit buys an analysis: the calls are read per tool rather than as
 * payloads of `unknown`, and each tool is counted in the terms it alone states. A call of a
 * tool the toolkit does not describe still reads — as the unconstrained part the tolerant
 * reader admits — and is counted apart rather than dropped.
 *
 * The parts are built here rather than read from a `.trajs` file so the case stands on its
 * own; a real analysis reads the same parts as the `stream` of a session
 * `Trajectory.toSessions` read of a trajectory an `Exchange` loaded.
 */

import { expect, it } from "@effect/vitest";
import {
  EventKit,
  ExtraKit,
  MetricKit,
  Prompt,
  Response,
  Tool,
  Toolkit,
  Trajectory,
  View,
} from "@trajs/core";
import { Effect, Match, Option, Result, Schema, Stream } from "effect";

/** The tools the run had, as the parameters each of them takes. */
const toolkit = Toolkit.make(
  Tool.make("get_weather", {
    parameters: Schema.Struct({
      city: Schema.String,
      unit: Schema.Literals(["celsius", "fahrenheit"]),
    }),
    success: Schema.String,
  }),
  Tool.make("search_docs", {
    parameters: Schema.Struct({ query: Schema.String, limit: Schema.Number }),
    success: Schema.Array(Schema.String),
  }),
  Tool.make("read_file", {
    parameters: Schema.Struct({ path: Schema.String }),
    success: Schema.String,
  }),
);

/** What the trajectory is built and read with: the toolkit its responses were returned by, and no other kit. */
const config = Trajectory.config({
  stream: false,
  toolkit,
  eventkit: EventKit.empty,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
});

/** What the run asked of its tools, each tool counted in the terms its parameters state. */
interface Report {
  /** The cities the weather was asked about, each once, in the order asked. */
  readonly cities: ReadonlyArray<string>;
  /** The queries searched, each once, in the order searched. */
  readonly queries: ReadonlyArray<string>;
  /** The widest page the searches were asked for. */
  readonly widestLimit: number;
  /** The files read, by the extension of each: how many of that kind were read. */
  readonly extensions: Readonly<Record<string, number>>;
  /** The calls made with tools the toolkit does not describe. */
  readonly undescribed: number;
}

const part = Trajectory.parts(config);

// Made a trajectory of the config rather than only checked against it, so what `View` reads
// out of the session it holds is the toolkit's own: each call is typed by the tool it names.
const trajectory = Trajectory.make(
  Stream.fromArray([
    part.prompt(Prompt.make("What is the weather in Paris, and in Berlin?")),
    part.response(
      Response.makePart("tool-call", {
        id: "call_1",
        name: "get_weather",
        params: { city: "Paris", unit: "celsius" },
        providerExecuted: false,
      }),
    ),
    part.response(
      Response.makePart("tool-call", {
        id: "call_2",
        name: "get_weather",
        params: { city: "Berlin", unit: "celsius" },
        providerExecuted: false,
      }),
    ),
    part.prompt(Prompt.make("Search for the retry policy, and read what it names.")),
    part.response(
      Response.makePart("tool-call", {
        id: "call_3",
        name: "search_docs",
        params: { query: "retry policy", limit: 5 },
        providerExecuted: false,
      }),
    ),
    part.response(
      Response.makePart("tool-call", {
        id: "call_4",
        name: "read_file",
        params: { path: "src/retry.ts" },
        providerExecuted: false,
      }),
    ),
    part.response(
      Response.makePart("tool-call", {
        id: "call_5",
        name: "read_file",
        params: { path: "docs/retry.md" },
        providerExecuted: false,
      }),
    ),
    // A tool the toolkit says nothing about: the run fetched a page, and no tool of the
    // toolkit describes a fetch, so the call reads as it was stated rather than being dropped.
    part.response(
      Response.anyToolCallPart({
        id: "call_6",
        name: "web_fetch",
        params: { url: "https://example.com/retry" },
        providerExecuted: false,
      }),
    ),
    part.prompt(Prompt.make("Search again, wider — and for backoff too.")),
    part.response(
      Response.makePart("tool-call", {
        id: "call_7",
        name: "search_docs",
        params: { query: "retry policy", limit: 20 },
        providerExecuted: false,
      }),
    ),
    part.response(
      Response.makePart("tool-call", {
        id: "call_8",
        name: "search_docs",
        params: { query: "backoff", limit: 10 },
        providerExecuted: false,
      }),
    ),
  ]),
  config,
);

const main = Effect.fn(function* () {
  const sessions = yield* Trajectory.toSessions(trajectory);
  const session = Option.getOrThrow(Trajectory.session(Trajectory.rootSession)(sessions));

  return yield* session.stream.pipe(
    // Parts to calls: what the run asked of its tools is what the report is of, so a part
    // that is not a call is read past.
    View.promptTurns,
    Stream.flatMap(({ response }) => Stream.fromIterable(response)),
    Stream.filterMap((part) =>
      part.type === "tool-call" ? Result.succeed(part) : Result.failVoid,
    ),
    // Calls to the report: folded as they arrive rather than collected first, so the parts
    // are read in one pass.
    Stream.runFold(
      (): Report => ({ cities: [], queries: [], widestLimit: 0, extensions: {}, undescribed: 0 }),
      (report, call) =>
        // Each arm may only name a tool the toolkit describes, and the parameters it is handed
        // are that tool's own; a call of any other tool is the arm below.
        Match.value(call).pipe(
          Match.discriminator("name")("get_weather", ({ params: { city } }) => ({
            ...report,
            cities: report.cities.includes(city) ? report.cities : [...report.cities, city],
          })),
          Match.discriminator("name")("search_docs", ({ params: { query, limit } }) => ({
            ...report,
            queries: report.queries.includes(query) ? report.queries : [...report.queries, query],
            widestLimit: Math.max(report.widestLimit, limit),
          })),
          Match.discriminator("name")("read_file", ({ params: { path } }) => {
            const extension = path.slice(path.lastIndexOf(".") + 1);

            return {
              ...report,
              extensions: {
                ...report.extensions,
                [extension]: (report.extensions[extension] ?? 0) + 1,
              },
            };
          }),
          Match.orElse(() => ({ ...report, undescribed: report.undescribed + 1 })),
        ),
    ),
  );
});

it.effect("main", () =>
  main().pipe(
    Effect.map((report) =>
      expect(report).toEqual({
        // Paris and Berlin were each asked about once, so the count is of cities, not of calls.
        cities: ["Paris", "Berlin"],
        // The same query was searched twice — once narrowly and once wide — so it is held
        // once, and the wider page of the two is the one kept.
        queries: ["retry policy", "backoff"],
        widestLimit: 20,
        extensions: { ts: 1, md: 1 },
        undescribed: 1,
      } satisfies Report),
    ),
  ),
);
