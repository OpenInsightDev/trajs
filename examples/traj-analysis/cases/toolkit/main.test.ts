/**
 * A run whose tools are the ones the trajectory was written with: each call read in the
 * terms its tool's parameters state, and counted by them.
 *
 * The trajectory is typed with the toolkit its responses were returned by — `Config` below
 * names it — so a response part is typed by the tool it names: `get_weather` holds a city,
 * `search_docs` a query and a page size, `read_file` a path. That is what a toolkit buys an
 * analysis: the calls are read per tool rather than as payloads of `unknown`, and each tool
 * is counted in the terms it alone states. A call of a tool the toolkit does not describe
 * still reads — as the unconstrained part the tolerant reader admits — and is counted apart
 * rather than dropped.
 *
 * The trajectory is built here rather than read from a `.trajs` file so the case stands on
 * its own; a real analysis reads the same parts with `Exchange`.
 */

import { expect, it } from "@effect/vitest";
import {
  Event,
  Extra,
  Metric,
  Prompt,
  Response,
  Tool,
  Toolkit,
  Trajectory,
  View,
} from "@trajs/core";
import { Effect, Match, Schema, Stream } from "effect";

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

const extrakit = Extra.emptyKit;

/** What the trajectory is read with: the toolkit its responses were returned by, and no other kit. */
type Config = Trajectory.Config<
  false,
  typeof toolkit,
  Event.EmptyKit,
  Metric.EmptyKit,
  typeof extrakit
>;

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

const makePrompt = Trajectory.promptPart(extrakit);
const makeResponse = Trajectory.responsePart({ toolkit, extrakit, stream: false });

// Typed with the config rather than only checked against it: what `View` reads out of the
// trajectory is the toolkit's own where the stream it is read from is typed by it.
const trajStream: Trajectory.TrajectoryStream<Config> = Stream.fromArray([
  makePrompt(Prompt.make("What is the weather in Paris, and in Berlin?")),
  makeResponse(
    Response.makePart("tool-call", {
      id: "call_1",
      name: "get_weather",
      params: { city: "Paris", unit: "celsius" },
      providerExecuted: false,
    }),
  ),
  makeResponse(
    Response.makePart("tool-call", {
      id: "call_2",
      name: "get_weather",
      params: { city: "Berlin", unit: "celsius" },
      providerExecuted: false,
    }),
  ),
  makePrompt(Prompt.make("Search for the retry policy, and read what it names.")),
  makeResponse(
    Response.makePart("tool-call", {
      id: "call_3",
      name: "search_docs",
      params: { query: "retry policy", limit: 5 },
      providerExecuted: false,
    }),
  ),
  makeResponse(
    Response.makePart("tool-call", {
      id: "call_4",
      name: "read_file",
      params: { path: "src/retry.ts" },
      providerExecuted: false,
    }),
  ),
  makeResponse(
    Response.makePart("tool-call", {
      id: "call_5",
      name: "read_file",
      params: { path: "docs/retry.md" },
      providerExecuted: false,
    }),
  ),
  // A tool the toolkit says nothing about: the run fetched a page, and no tool of the
  // toolkit describes a fetch, so the call reads as it was stated rather than being dropped.
  makeResponse(
    Response.anyToolCallPart({
      id: "call_6",
      name: "web_fetch",
      params: { url: "https://example.com/retry" },
      providerExecuted: false,
    }),
  ),
  makePrompt(Prompt.make("Search again, wider — and for backoff too.")),
  makeResponse(
    Response.makePart("tool-call", {
      id: "call_7",
      name: "search_docs",
      params: { query: "retry policy", limit: 20 },
      providerExecuted: false,
    }),
  ),
  makeResponse(
    Response.makePart("tool-call", {
      id: "call_8",
      name: "search_docs",
      params: { query: "backoff", limit: 10 },
      providerExecuted: false,
    }),
  ),
]);

const main = Effect.fn(function* () {
  const turns = yield* View.promptTurns(trajStream).pipe(Stream.runCollect);

  const cities: string[] = [];
  const queries: string[] = [];
  let widestLimit = 0;
  const extensions: Record<string, number> = {};
  let undescribed = 0;

  for (const { response } of turns) {
    for (const part of response) {
      if (part.type !== "tool-call") continue;

      // Each arm may only name a tool the toolkit describes, and the parameters it is handed
      // are that tool's own; a call of any other tool is the arm below.
      Match.value(part).pipe(
        Match.discriminator("name")("get_weather", ({ params: { city } }) => {
          if (!cities.includes(city)) cities.push(city);
        }),
        Match.discriminator("name")("search_docs", ({ params: { query, limit } }) => {
          if (!queries.includes(query)) queries.push(query);
          widestLimit = Math.max(widestLimit, limit);
        }),
        Match.discriminator("name")("read_file", ({ params: { path } }) => {
          const extension = path.slice(path.lastIndexOf(".") + 1);
          extensions[extension] = (extensions[extension] ?? 0) + 1;
        }),
        Match.orElse(() => {
          undescribed += 1;
        }),
      );
    }
  }

  return { cities, queries, widestLimit, extensions, undescribed } satisfies Report;
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
