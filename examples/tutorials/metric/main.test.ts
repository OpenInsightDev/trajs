import { expect, it } from "@effect/vitest";
import { Metric, MetricKit, Prompt, Response, Trajectory, VersionedSchema } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Match, Predicate, Schema, Stream } from "effect";

const config = Config.config();

const part = Trajectory.parts(config);

interface Summary {
  /** Characters of text each tool result held. */
  readonly results: ReadonlyArray<{ readonly call: string; readonly characters: number }>;

  /** Results the metric could not count. */
  readonly unmeasured: ReadonlyArray<{ readonly call: string; readonly reason: string }>;

  /** Characters of tool text in the session. */
  readonly characters: number;
}

const grepResult = part.response(
  Response.anyToolResultPart({
    id: "call_grep",
    name: "grep",
    isFailure: false,
    result: "src/config.ts:12",
  }),
);

const configResult = part.response(
  Response.anyToolResultPart({
    id: "call_read",
    name: "read_file",
    isFailure: false,
    result: "export const readTimeout = () => Number(process.env.TIMEOUT_MS);",
  }),
);

const screenshotResult = part.response(
  Response.anyToolResultPart({
    id: "call_view",
    name: "view_image",
    isFailure: false,
    result: { mediaType: "image/png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
  }),
);

const parts = [
  part.prompt(Prompt.make("Where is the timeout read?")),
  part.response(
    Response.anyToolCallPart({ id: "call_grep", name: "grep", params: { pattern: "readTimeout" } }),
  ),
  grepResult,

  part.response(
    Response.anyToolCallPart({
      id: "call_read",
      name: "read_file",
      params: { path: "src/config.ts" },
    }),
  ),
  configResult,

  part.response(Response.makePart("text", { text: "It reads `TIMEOUT_MS` from the environment." })),

  part.prompt(Prompt.make("Is it also set on the settings page? Check the screenshot.")),
  part.response(
    Response.anyToolCallPart({
      id: "call_view",
      name: "view_image",
      params: { path: "docs/settings.png" },
    }),
  ),
  screenshotResult,
];

const trajectory = Trajectory.make(config)(Stream.fromArray(parts));

/** What one tool result is worth: the characters of text it handed back. */
const characters = Schema.Struct({
  version: Schema.Literal("0.1.0"),
  characters: Schema.Number,
}).pipe(VersionedSchema.make);

/** Why one result was not counted: the tool answered with something that is not text. */
const notText = Schema.Struct({
  version: Schema.Literal("0.1.0"),
  reason: Schema.Literal("not-text"),
}).pipe(VersionedSchema.make);

const toolText = new Metric.Metric({
  // The tag a metric's parts are produced under is its package name and its id.
  packageName: "tutorial",
  id: "ToolText",
  metadata: new Metric.Metadata({ name: "Tool result text" }),
  // What the package that declares the metric states of itself.
  packageMetadata: { version: "0.0.0" },
  output: characters,
  failure: notText,
});

/** The datum one part is worth: its count, or the failure of a result with no text to count. */
const datumOf = (
  value: Trajectory.Part<Config.AnyConfig>,
): Effect.Effect<
  ReadonlyArray<Metric.Output<typeof toolText>>,
  Metric.Failure<typeof toolText>
> => {
  if (!Predicate.isTagged("Response")(value) || value.response.type !== "tool-result") {
    return Effect.succeed([]);
  }

  const { uuid, response } = value;

  if (!Predicate.isString(response.result)) {
    return Effect.fail(
      Metric.makeFailure<typeof toolText>(notText.make({ version: "0.1.0", reason: "not-text" }), {
        attach: [uuid],
      }),
    );
  }

  return Effect.succeed([
    Metric.makeOutput<typeof toolText>(
      characters.make({ version: "0.1.0", characters: response.result.length }),
      { attach: [uuid] },
    ),
  ]);
};

// A producer reads a trajectory and states a datum per part it measures. The datum
// names the part by its uuid rather than restating it. A part the metric cannot read
// fails the producer, so the parts after it are not measured.
const measure: Metric.Producer<typeof toolText> = (trajectory) =>
  trajectory.pipe(Stream.mapEffect(datumOf), Stream.flattenIterable);

// The kit says which producer states which metric.
const counted = MetricKit.toProducers(MetricKit.make(toolText), {
  [toolText.tag]: measure,
});

// The call each result answers, by the uuid a datum attaches to.
const calls = new Map<string, string>(
  parts.flatMap((value) =>
    Match.value(value).pipe(
      Match.when({ _tag: "Response", response: { type: "tool-result" } }, ({ uuid, response }) => [
        [uuid, response.name] as const,
      ]),
      Match.orElse(() => []),
    ),
  ),
);

const main = Effect.fn(function* () {
  // Metric.produce runs every producer of the kit over the parts. A datum is the
  // output of a measured part or the failure of one the producer could not read.
  return yield* Metric.produce(counted)(trajectory).pipe(
    Stream.runFold(
      (): Summary => ({ results: [], unmeasured: [], characters: 0 }),
      (summary, { data }) => {
        const call = calls.get(data.attach?.[0] ?? "") ?? "unknown";

        return Match.valueTags(data, {
          Output: ({ output }) => ({
            ...summary,
            results: [...summary.results, { call, characters: output.characters }],
            characters: summary.characters + output.characters,
          }),
          Failure: ({ failure }) => ({
            ...summary,
            unmeasured: [...summary.unmeasured, { call, reason: failure.reason }],
          }),
        });
      },
    ),
  );
});

it.effect("main", () =>
  Effect.map(main(), (summary) =>
    expect(summary).toEqual({
      results: [
        { call: "grep", characters: 16 },
        { call: "read_file", characters: 64 },
      ],
      unmeasured: [{ call: "view_image", reason: "not-text" }],
      characters: 80,
    } satisfies Summary),
  ),
);
