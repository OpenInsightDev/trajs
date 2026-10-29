import { expect, it } from "@effect/vitest";
import {
  Cache,
  Metric,
  MetricKit,
  Prompt,
  Response,
  Trajectory,
  VersionedSchema,
  View,
} from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Match, Predicate, Schema, Stream } from "effect";

interface Summary {
  /** Tool results with a result naming them, in session order. */
  readonly results: ReadonlyArray<{
    readonly tool: string;
    readonly characters: number;
  }>;

  /** Characters of the results left in the stream, in order. */
  readonly remainingResults: ReadonlyArray<number>;
}

/** Characters of text one tool result holds. */
const characters = Schema.Struct({
  version: Schema.Literal("0.1.0"),
  characters: Schema.Number,
}).pipe(VersionedSchema.make);

/** Why a result is not counted: the tool answers with something that is not text. */
const notText = Schema.Struct({
  version: Schema.Literal("0.1.0"),
  reason: Schema.Literal("not-text"),
}).pipe(VersionedSchema.make);

const toolText = new Metric.Metric({
  packageName: "tutorial",
  id: "ToolText",
  metadata: new Metric.Metadata({ name: "Tool result text" }),
  output: characters,
  failure: notText,
});

// The declaration is on the config, so the trajectory's metric parts decode as
// this metric's results.
const config = Config.config({
  metrickit: MetricKit.make(toolText),
});

const part = Trajectory.parts(config);

const grepText = "src/config.ts:12";
const readText = "export const readTimeout = () => Number(process.env.TIMEOUT_MS);";

const grepResult = part.response(
  Response.anyToolResultPart({
    id: "call_grep",
    name: "grep",
    isFailure: false,
    result: grepText,
  }),
);

const readResult = part.response(
  Response.anyToolResultPart({
    id: "call_read",
    name: "read_file",
    isFailure: false,
    result: readText,
  }),
);

const trajectory = Trajectory.make(config)(
  Stream.fromArray([
    part.prompt(Prompt.make("Where is the timeout read?")),
    part.response(
      Response.anyToolCallPart({
        id: "call_grep",
        name: "grep",
        params: { pattern: "readTimeout" },
      }),
    ),
    grepResult,
    part.response(
      Response.makePart("text", {
        text: "It reads `TIMEOUT_MS` from the environment.",
      }),
    ),
    part.prompt(Prompt.make("Where is it parsed into a number?")),
    part.response(
      Response.anyToolCallPart({
        id: "call_read",
        name: "read_file",
        params: { path: "src/config.ts" },
      }),
    ),
    readResult,
    part.response(
      Response.makePart("text", {
        text: "`readTimeout` parses it with `Number`.",
      }),
    ),
  ]),
);

/** What the producer reports: a result's text length, then the run's total. */
const measure: Metric.Producer<typeof toolText> = (input) =>
  input.pipe(
    Stream.mapAccum(
      () => 0,
      (total, value) =>
        Match.value(value).pipe(
          Match.when(
            { _tag: "Response", response: { type: "tool-result" } },
            ({ uuid, response }) => {
              if (!Predicate.isString(response.result)) {
                return [total, []] as const;
              }

              const count = response.result.length;

              return [
                total + count,
                [
                  Metric.makeOutput<typeof toolText>(
                    characters.make({ version: "0.1.0", characters: count }),
                    { attach: [uuid] },
                  ),
                ],
              ] as const;
            },
          ),
          Match.orElse(() => [total, []] as const),
        ),
      {
        // A run-wide summary names no part, so the view leaves it in the stream.
        onHalt: (total) => [
          Metric.makeOutput<typeof toolText>(
            characters.make({ version: "0.1.0", characters: total }),
            {},
          ),
        ],
      },
    ),
  );

const counted = MetricKit.toProducers(MetricKit.make(toolText), {
  [toolText.tag]: measure,
});

const main = Effect.fn(function* () {
  // A produced result is a part too, so it is concatenated after the run it
  // measures.
  const results = Metric.produce(counted)(trajectory).pipe(
    Stream.map((metric) => part.metric(metric)),
  );

  const stored = Stream.concat(trajectory, results).pipe(Trajectory.make(config));

  // A part comes back with the results naming it; a result naming no part stays
  // a part.
  const view = yield* View.metricTrajectory(stored);

  return yield* view.pipe(
    Stream.runFold(
      (): Summary => ({ results: [], remainingResults: [] }),
      (summary, value) =>
        Match.value(value).pipe(
          Match.tag("Metric", ({ metric }) =>
            Match.valueTags(metric.data, {
              Output: ({ output }) => ({
                ...summary,
                remainingResults: [...summary.remainingResults, output.characters],
              }),
              Failure: () => summary,
            }),
          ),
          Match.when(
            { _tag: "Response", response: { type: "tool-result" } },
            ({ response, metrics }) =>
              Match.value(metrics[toolText.tag]?.[0]?.metric.data).pipe(
                Match.tag("Output", ({ output }) => ({
                  ...summary,
                  results: [
                    ...summary.results,
                    { tool: response.name, characters: output.characters },
                  ],
                })),
                Match.orElse(() => summary),
              ),
          ),
          Match.orElse(() => summary),
        ),
    ),
  );
});

it.effect("main", () =>
  main().pipe(
    Effect.provide(Cache.layer()),
    Effect.map((summary) =>
      expect(summary).toEqual({
        results: [
          { tool: "grep", characters: 16 },
          { tool: "read_file", characters: 64 },
        ],
        remainingResults: [80],
      } satisfies Summary),
    ),
  ),
);
