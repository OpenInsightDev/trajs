import { expect, it } from "@effect/vitest";
import {
  ExtraKit,
  MetricKit,
  Prompt,
  Response,
  Session,
  Tool,
  Toolkit,
  Trajectory,
  View,
} from "@trajs/core";
import { Cache } from "@trajs/core/Cache";
import * as Config from "@trajs/core/Config";
import { contextManagement, eventkit } from "@trajs/extension-atif";
import { Effect, Match, Schema, Stream } from "effect";
import { castDraft, produce } from "immer";

const toolkit = Toolkit.make(
  Tool.make("grep", {
    parameters: Schema.Struct({ pattern: Schema.String }),
    success: Schema.String,
  }),
  Tool.make("read_file", {
    parameters: Schema.Struct({ path: Schema.String }),
    success: Schema.String,
  }),
  Tool.make("edit_file", {
    parameters: Schema.Struct({ path: Schema.String }),
    success: Schema.String,
  }),
);

const config = Config.config({
  stream: false,
  toolkit,
  eventkit,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
});

interface Phase {
  readonly openedBy: string;

  readonly at: number;
  readonly prompts: number;

  readonly responses: number;

  readonly parts: number;

  readonly tools: Readonly<Record<string, number>>;

  readonly files: ReadonlyArray<string>;
}

interface Report {
  readonly steps: Readonly<Record<"prompt" | "response" | "event", number>>;

  readonly phases: ReadonlyArray<Phase>;

  readonly rediscovered: ReadonlyArray<string>;
}

interface Reading {
  readonly steps: Report["steps"];

  readonly phases: ReadonlyArray<Phase>;

  readonly read: ReadonlyArray<string>;
  readonly rediscovered: ReadonlyArray<string>;
}

const part = Trajectory.parts(config);

const grep = (id: string, pattern: string) =>
  part.response(
    Response.makePart("tool-call", {
      id,
      name: "grep",
      params: { pattern },
      providerExecuted: false,
    }),
  );

const read = (id: string, path: string) =>
  part.response(
    Response.makePart("tool-call", {
      id,
      name: "read_file",
      params: { path },
      providerExecuted: false,
    }),
  );

const edit = (id: string, path: string) =>
  part.response(
    Response.makePart("tool-call", {
      id,
      name: "edit_file",
      params: { path },
      providerExecuted: false,
    }),
  );

const answered = (id: string, name: string, result: string) =>
  part.response(
    Response.anyToolResultPart({ id, name, result, isFailure: false, providerExecuted: false }),
  );

const said = (text: string) => part.response(Response.makePart("text", { text }));

const finished = (reason: Response.FinishReason, input: number, output: number) =>
  part.response(
    Response.makePart("finish", {
      reason,
      usage: new Response.Usage({
        inputTokens: { total: input },
        outputTokens: { total: output },
      }),
    }),
  );

const open = (openedBy: string, at: number): Phase => ({
  openedBy,
  at,
  prompts: 0,
  responses: 0,
  parts: 0,
  tools: {},
  files: [],
});

const trajectory = Trajectory.make(config)(
  Stream.fromArray([
    part.prompt(
      Prompt.make(
        "`bun test src/settings.test.ts` fails on CI but passes locally. Where is the timeout read from?",
      ),
    ),
    grep("call_grep", "readTimeout"),
    answered(
      "call_grep",
      "grep",
      "src/config.ts:12:export const readTimeout = () => Number(process.env.TIMEOUT_MS);",
    ),
    finished("tool-calls", 1_820, 146),
    part.prompt(Prompt.make("Read the module it is defined in.")),
    read("call_read_1", "src/config.ts"),
    answered(
      "call_read_1",
      "read_file",
      "export const readTimeout = () => Number(process.env.TIMEOUT_MS);\nexport const settings = { timeout: readTimeout() };",
    ),
    said("CI sets no TIMEOUT_MS, so the timeout is NaN and the settings test fails."),
    finished("stop", 2_140, 210),

    part.event(contextManagement({ type: "compaction", boundary: "replace" })),

    part.prompt(Prompt.make("Continue and fix the failing test.")),
    read("call_read_2", "src/config.ts"),
    answered(
      "call_read_2",
      "read_file",
      "export const readTimeout = () => Number(process.env.TIMEOUT_MS);\nexport const settings = { timeout: readTimeout() };",
    ),
    finished("tool-calls", 1_260, 132),
    part.prompt(Prompt.make("Apply the fix.")),
    edit("call_edit", "src/config.ts"),
    answered("call_edit", "edit_file", "1 file changed"),
    said("Defaulted the timeout to 30 seconds when TIMEOUT_MS is unset."),
    finished("stop", 1_680, 190),
  ]),
);

const main = Effect.fn(function* () {
  const session = yield* Session.main(trajectory);

  const reading = yield* session.stream.pipe(
    View.steps,

    Stream.runFold(
      (): Reading => ({
        steps: { prompt: 0, response: 0, event: 0 },
        phases: [open("run", 1)],
        read: [],
        rediscovered: [],
      }),
      (reading, step) =>
        produce(reading, (draft) => {
          const phase = draft.phases[draft.phases.length - 1];
          const at = draft.steps.prompt + draft.steps.response + draft.steps.event + 1;

          if (step._tag === "Event") {
            draft.steps.event += 1;

            draft.read.push(...phase.files);

            const { event } = step.event;
            const opened = open(event.data.type, at + 1);
            draft.phases.push(castDraft(opened));

            return;
          }

          if (step._tag === "Prompt") {
            draft.steps.prompt += 1;
            phase.prompts += 1;

            return;
          }

          draft.steps.response += 1;
          phase.responses += 1;
          phase.parts += step.response.length;

          for (const part of step.response) {
            if (part.type !== "tool-call") continue;

            phase.tools[part.name] = (phase.tools[part.name] ?? 0) + 1;

            const path = Match.value(part).pipe(
              Match.discriminator("name")("read_file", ({ params }) => params.path),
              Match.orElse(() => undefined),
            );

            if (path === undefined) continue;

            if (draft.read.includes(path) && !draft.rediscovered.includes(path)) {
              draft.rediscovered.push(path);
            }

            if (!phase.files.includes(path)) phase.files.push(path);
          }
        }),
    ),
  );

  return {
    steps: reading.steps,
    phases: reading.phases,
    rediscovered: reading.rediscovered,
  } satisfies Report;
});

it.effect("main", () =>
  main().pipe(
    Effect.provide(Cache.layer()),
    Effect.map(({ steps, phases, rediscovered }) => {
      expect(steps).toEqual({ prompt: 4, response: 4, event: 1 });

      expect(phases).toEqual([
        {
          openedBy: "run",
          at: 1,
          prompts: 2,
          responses: 2,
          parts: 7,
          tools: { grep: 1, read_file: 1 },
          files: ["src/config.ts"],
        },
        {
          openedBy: "compaction",
          at: 6,
          prompts: 2,
          responses: 2,
          parts: 7,
          tools: { read_file: 1, edit_file: 1 },
          files: ["src/config.ts"],
        },
      ]);

      expect(rediscovered).toEqual(["src/config.ts"]);
    }),
  ),
);
