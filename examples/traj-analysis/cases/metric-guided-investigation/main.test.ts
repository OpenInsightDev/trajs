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
import { Effect, Match, Predicate, Result, Schema, Stream } from "effect";

interface Evidence {
  readonly version: "0.1.0";
  readonly finding: "timeout-unset" | "tests-pass" | "repeat";
}

interface Report {
  readonly findings: ReadonlyArray<Evidence["finding"]>;
  readonly resolvedOnRun: number | undefined;
  readonly redundantRuns: ReadonlyArray<number>;
}

const evidenceSchema = Schema.Struct({
  version: Schema.Literal("0.1.0"),
  finding: Schema.Literals(["timeout-unset", "tests-pass", "repeat"]),
}).pipe(VersionedSchema.make);

const testEvidence = new Metric.Metric({
  package: "case",
  id: "TestEvidence",
  metadata: new Metric.Metadata({ name: "Test result evidence" }),
  output: evidenceSchema,
  failure: evidenceSchema,
});

const config = Config.config({ metrickit: MetricKit.make(testEvidence) });
const part = Trajectory.parts(config);

const prompt = (text: string) => part.prompt(Prompt.make(text));

const firstTest = part.response(
  Response.anyToolResultPart({
    id: "call_test_1",
    name: "bash",
    result: "FAIL src/settings.test.ts: expected 30, received NaN",
    isFailure: false,
  }),
);

const fixedTest = part.response(
  Response.anyToolResultPart({
    id: "call_test_2",
    name: "bash",
    result: "PASS src/settings.test.ts",
    isFailure: false,
  }),
);

const repeatedTest = part.response(
  Response.anyToolResultPart({
    id: "call_test_3",
    name: "bash",
    result: "PASS src/settings.test.ts",
    isFailure: false,
  }),
);

const trajectory = Trajectory.make(config)(
  Stream.fromArray([
    prompt("The settings test fails in CI. Find the cause and fix it."),
    part.response(
      Response.anyToolCallPart({
        id: "call_test_1",
        name: "bash",
        params: { command: "bun test" },
      }),
    ),
    firstTest,
    prompt("Inspect the timeout configuration and apply a fix."),
    part.response(
      Response.anyToolCallPart({
        id: "call_read",
        name: "read_file",
        params: { path: "src/config.ts" },
      }),
    ),
    part.response(
      Response.anyToolResultPart({
        id: "call_read",
        name: "read_file",
        result: "export const timeout = Number(process.env.TIMEOUT_MS);",
        isFailure: false,
      }),
    ),
    part.response(
      Response.anyToolCallPart({
        id: "call_edit",
        name: "edit_file",
        params: { path: "src/config.ts" },
      }),
    ),
    part.response(
      Response.anyToolResultPart({
        id: "call_edit",
        name: "edit_file",
        result: "1 file changed: default timeout to 30",
        isFailure: false,
      }),
    ),
    prompt("Verify the fix."),
    part.response(
      Response.anyToolCallPart({
        id: "call_test_2",
        name: "bash",
        params: { command: "bun test" },
      }),
    ),
    fixedTest,
    part.response(
      Response.anyToolCallPart({
        id: "call_test_3",
        name: "bash",
        params: { command: "bun test" },
      }),
    ),
    repeatedTest,
  ]),
);

const measure: Metric.Producer<typeof testEvidence> = (input) =>
  input.pipe(
    Stream.mapAccum(
      () => false,
      (hasPassingResult, value) => {
        if (!Predicate.isTagged("Response")(value) || value.response.type !== "tool-result") {
          return [hasPassingResult, []];
        }

        const { response } = value;

        if (response.name !== "bash" || !Predicate.isString(response.result)) {
          return [hasPassingResult, []];
        }

        const isPassing = response.result.startsWith("PASS");
        const finding = !isPassing ? "timeout-unset" : hasPassingResult ? "repeat" : "tests-pass";

        return [
          hasPassingResult || isPassing,
          [
            Metric.makeOutput<typeof testEvidence>(
              evidenceSchema.make({ version: "0.1.0", finding }),
              { attach: [value.uuid] },
            ),
          ],
        ];
      },
    ),
  );

const metrickit = MetricKit.toProducers(MetricKit.make(testEvidence), {
  [testEvidence.tag]: measure,
});

const main = Effect.fn(function* () {
  const reports = Metric.produce(metrickit)(trajectory).pipe(
    Stream.map((metric) => part.metric(metric)),
  );

  // View.metricTrajectory reads the trajectory into the cache, then carries each
  // report to the part it names, under that report's metric tag.
  const view = yield* Stream.concat(reports, trajectory).pipe(
    Trajectory.make(config),
    View.metricTrajectory,
  );

  const runs = yield* view.pipe(
    // A run is one bash test result, so other parts are dropped here.
    Stream.filterMap((value) =>
      Match.value(value).pipe(
        Match.when(
          { _tag: "Response", response: { type: "tool-result", name: "bash" } },
          ({ metrics }) => Result.succeed(metrics),
        ),
        Match.orElse(() => Result.failVoid),
      ),
    ),
    Stream.filterMap((metrics) =>
      Match.value(metrics[testEvidence.tag]?.[0]?.metric.data).pipe(
        Match.tag("Output", ({ output }) => Result.succeed(output.finding)),
        Match.orElse(() => Result.failVoid),
      ),
    ),
    Stream.runFold(
      (): Report => ({ findings: [], resolvedOnRun: undefined, redundantRuns: [] }),
      (report, finding) => {
        const run = report.findings.length + 1;

        return {
          findings: [...report.findings, finding],
          resolvedOnRun: report.resolvedOnRun ?? (finding === "tests-pass" ? run : undefined),
          redundantRuns:
            finding === "repeat" ? [...report.redundantRuns, run] : report.redundantRuns,
        };
      },
    ),
  );

  return runs;
});

it.effect("main", () =>
  main().pipe(
    Effect.provide(Cache.layer()),
    Effect.map((report) =>
      expect(report).toEqual({
        findings: ["timeout-unset", "tests-pass", "repeat"],
        resolvedOnRun: 2,
        redundantRuns: [3],
      } satisfies Report),
    ),
  ),
);
