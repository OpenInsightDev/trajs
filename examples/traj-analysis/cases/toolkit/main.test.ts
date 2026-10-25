import { expect, it } from "@effect/vitest";
import { Cache, Prompt, Response, Session, Tool, Toolkit, Trajectory, View } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Match, Schema, Stream } from "effect";

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

const config = Config.config({ stream: false, toolkit });

interface Report {
  readonly cities: ReadonlyArray<string>;

  readonly queries: ReadonlyArray<string>;

  readonly limit: number;

  readonly extensions: Readonly<Record<string, number>>;

  readonly undescribed: number;
}

const part = Trajectory.parts(config);

const trajectory = Trajectory.make(config)(
  Stream.fromArray([
    part.prompt(Prompt.make("What is the weather in Paris, and in Berlin?")),
    part.response(
      Response.anyToolCallPart({
        id: "call_1",
        name: "get_weather",
        params: { city: "Paris", unit: "celsius" },
      }),
    ),
    part.response(
      Response.anyToolCallPart({
        id: "call_2",
        name: "get_weather",
        params: { city: "Berlin", unit: "celsius" },
      }),
    ),
    part.prompt(Prompt.make("Search for the retry policy, and read what it names.")),
    part.response(
      Response.anyToolCallPart({
        id: "call_3",
        name: "search_docs",
        params: { query: "retry policy", limit: 5 },
      }),
    ),
    part.response(
      Response.anyToolCallPart({
        id: "call_4",
        name: "read_file",
        params: { path: "src/retry.ts" },
      }),
    ),
    part.response(
      Response.anyToolCallPart({
        id: "call_5",
        name: "read_file",
        params: { path: "docs/retry.md" },
      }),
    ),

    part.response(
      Response.anyToolCallPart({
        id: "call_6",
        name: "web_fetch",
        params: { url: "https://example.com/retry" },
      }),
    ),
    part.prompt(Prompt.make("Search again, wider — and for backoff too.")),
    part.response(
      Response.anyToolCallPart({
        id: "call_7",
        name: "search_docs",
        params: { query: "retry policy", limit: 20 },
      }),
    ),
    part.response(
      Response.anyToolCallPart({
        id: "call_8",
        name: "search_docs",
        params: { query: "backoff", limit: 10 },
      }),
    ),
  ]),
);

const main = Effect.fn(function* () {
  const session = yield* Session.main(trajectory);

  return yield* View.toolCalls(session.stream).pipe(
    Stream.runFold(
      (): Report => ({ cities: [], queries: [], limit: 0, extensions: {}, undescribed: 0 }),
      (report, call) =>
        Match.value(call).pipe(
          Match.discriminator("name")("get_weather", ({ params: { city } }) => ({
            ...report,
            cities: report.cities.includes(city) ? report.cities : [...report.cities, city],
          })),
          Match.discriminator("name")("search_docs", ({ params: { query, limit } }) => ({
            ...report,
            queries: report.queries.includes(query) ? report.queries : [...report.queries, query],
            limit: Math.max(report.limit, limit),
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
        cities: ["Paris", "Berlin"],

        queries: ["retry policy", "backoff"],
        limit: 20,
        extensions: { ts: 1, md: 1 },
        undescribed: 1,
      } satisfies Report),
    ),
    Effect.provide(Cache.layer()),
  ),
);
