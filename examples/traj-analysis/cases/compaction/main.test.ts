/**
 * A run whose context was compacted mid-task, read as the steps it happened in.
 *
 * The harness compacts the agent's context between two turns, and the summary it keeps
 * drops the files the agent had read. The parts of the session are read as the steps they
 * state. Each prompt, the responses produced together, and each event are one step, so the
 * compaction stands where it happened and the run splits into the phases either side of it.
 *
 * A phase is counted off the steps it holds: the prompts it was asked, the responses it
 * produced, the parts of those responses, the tools it called and the files it read. What a
 * phase reads that a phase before it had read already is what the compaction cost the
 * agent: it reads the same file again rather than recalling it. Read as turns
 * (`View.promptTurns`), the same run would hold no event at all, so the phases would be one
 * list and the read again would look like ordinary work.
 *
 * The compaction is the context management event `@trajs/extension-atif` declares. The run
 * produced it where its context was transformed, and the analysis reads it back with that
 * package's kit.
 *
 * The parts are built here rather than read from a `.trajs` file so the case stands on its
 * own; a real analysis reads the same parts as the `stream` of the session `Session.main`
 * read of a trajectory an `Exchange` loaded.
 */

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

/** The tools the run had, as the parameters each of them takes. */
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

/** What the parts are built and read with: the tools of the run, its event, and no other kit. */
const config = Config.config({
  stream: false,
  toolkit,
  eventkit,
  metrickit: MetricKit.empty,
  extrakit: ExtraKit.empty,
});

/** What one phase of the run was: what it was asked, what it produced, and what it used. */
interface Phase {
  /** What opened the phase: the start of the run, or the kind of transformation an event stated. */
  readonly openedBy: string;
  /** The step of the run the phase was opened at, counted from 1. */
  readonly at: number;
  readonly prompts: number;
  /** The responses produced, each a run of the parts the model produced together. */
  readonly responses: number;
  /** The parts those responses hold, in all. */
  readonly parts: number;
  /** The tools called, by name. */
  readonly tools: Readonly<Record<string, number>>;
  /** The files read, each once, in the order read. */
  readonly files: ReadonlyArray<string>;
}

/** What the run was read as. */
interface Report {
  /** The steps the session was read as, by the kind each states. */
  readonly steps: Readonly<Record<"prompt" | "response" | "event", number>>;
  /** The phases the events split the run into, in the order the run reached them. */
  readonly phases: ReadonlyArray<Phase>;
  /** The files a phase read that a phase before it had read already. */
  readonly rediscovered: ReadonlyArray<string>;
}

/** What the fold over the steps has read so far. */
interface Reading {
  readonly steps: Report["steps"];
  /** The phases read so far: the one the steps have reached is the last of them. */
  readonly phases: ReadonlyArray<Phase>;
  /** The files read before the last phase opened, which a read after it is a read again. */
  readonly read: ReadonlyArray<string>;
  readonly rediscovered: ReadonlyArray<string>;
}

const part = Trajectory.parts(config);

/** A call of `grep` for a pattern. */
const grep = (id: string, pattern: string) =>
  part.response(
    Response.makePart("tool-call", {
      id,
      name: "grep",
      params: { pattern },
      providerExecuted: false,
    }),
  );

/** A call of `read_file` for a path. */
const read = (id: string, path: string) =>
  part.response(
    Response.makePart("tool-call", {
      id,
      name: "read_file",
      params: { path },
      providerExecuted: false,
    }),
  );

/** A call of `edit_file` for a path. */
const edit = (id: string, path: string) =>
  part.response(
    Response.makePart("tool-call", {
      id,
      name: "edit_file",
      params: { path },
      providerExecuted: false,
    }),
  );

/** What a tool answered a call with. */
const answered = (id: string, name: string, result: string) =>
  part.response(
    Response.anyToolResultPart({ id, name, result, isFailure: false, providerExecuted: false }),
  );

/** What a model said of its own. */
const said = (text: string) => part.response(Response.makePart("text", { text }));

/** What a provider reported of the request a part ended, and why the request ended. */
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

/** The phase a run opens with, or an event opens after it. */
const open = (openedBy: string, at: number): Phase => ({
  openedBy,
  at,
  prompts: 0,
  responses: 0,
  parts: 0,
  tools: {},
  files: [],
});

/** What the run holds: a turn that found the cause, the compaction, and the turns that fixed it. */
const trajectory = Trajectory.make(config)(
  Stream.fromArray([
    // Before the compaction: the cause was found, and the module that states it was read.
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

    // The harness compacts the context: the summary keeps the cause but drops the file.
    part.event(contextManagement({ type: "compaction", boundary: "replace" })),

    // After it: the same module was read again before the fix could be made.
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
  // The session the parts belong to: no part of the run states another one, so the
  // trajectory is read as its mainline.
  const session = yield* Session.main(trajectory);

  const reading = yield* session.stream.pipe(
    // Parts to steps: each prompt, each run of responses, and each event, in the order the
    // session produced them.
    View.steps,
    // Steps to phases: an event closes the phase it happened in and opens the next, so every
    // step is counted in the phase it was produced in, and the event stands between two.
    Stream.runFold(
      (): Reading => ({
        steps: { prompt: 0, response: 0, event: 0 },
        phases: [open("run", 1)],
        read: [],
        rediscovered: [],
      }),
      (reading, step) =>
        produce(reading, (draft) => {
          // The phase the steps have reached: the last one opened.
          const phase = draft.phases[draft.phases.length - 1];
          const at = draft.steps.prompt + draft.steps.response + draft.steps.event + 1;

          if (step._tag === "Event") {
            draft.steps.event += 1;
            // The files the phase read are what a phase after the event can read again.
            draft.read.push(...phase.files);
            // The step holds the event part it was read from, which states the event itself.
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

            // The calls are read by the tool each names: a read is read in its own terms.
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
    // The parts are kept as the session reads them, in a byte store in memory.
    Effect.provide(Cache.layer()),
    Effect.map(({ steps, phases, rediscovered }) => {
      // Nine steps: four prompts, four runs of responses, and the compaction between the
      // second run and the third.
      expect(steps).toEqual({ prompt: 4, response: 4, event: 1 });

      // Two phases, split at the compaction: the second opens at the step after the event.
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

      // The compaction dropped the file from the agent's context: it had to read it again.
      expect(rediscovered).toEqual(["src/config.ts"]);
    }),
  ),
);
