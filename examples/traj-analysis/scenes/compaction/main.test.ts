import { expect, it } from "@effect/vitest";
import { Cache, Prompt, Response, Session, Tool, Toolkit, Trajectory, View } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Event } from "@trajs/core/unstable/atif";
import { Effect, Match, Schema, Stream } from "effect";

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

// The eventkit must sit on the config, or this event cannot be stored.
const config = Config.config({ stream: false, toolkit, eventkit: Event.eventkit });

interface Phase {
  /** What opened the phase: `"run"`, or the type of an event. */
  readonly openedBy: string;

  /** The number of the phase's first step. */
  readonly at: number;

  readonly prompts: number;
  readonly responses: number;

  /** The parts each response folds. */
  readonly parts: number;

  readonly tools: Readonly<Record<string, number>>;

  /** The paths the phase read, once each. */
  readonly paths: ReadonlyArray<string>;
}

/** A phase while the pass fills it, before it is stated as a {@link Phase}. */
interface PhaseDraft {
  readonly openedBy: string;

  readonly at: number;

  prompts: number;
  responses: number;
  parts: number;

  readonly tools: Map<string, number>;

  readonly paths: Set<string>;
}

interface Report {
  readonly steps: Readonly<Record<"prompt" | "response" | "event", number>>;

  /** The phases the events split the run into. */
  readonly phases: ReadonlyArray<Phase>;

  /** The paths a later phase read again. */
  readonly rediscovered: ReadonlyArray<string>;
}

/** The report while the pass fills it, before it is stated as a {@link Report}. */
interface ReportDraft {
  readonly steps: Record<"prompt" | "response" | "event", number>;

  /** The phases so far, the open one last. */
  readonly phases: Array<PhaseDraft>;

  /** The phase each path was first read in, by path. */
  readonly firstRead: Map<string, number>;

  /** The paths a later phase read again. */
  readonly rediscovered: Set<string>;
}

const part = Trajectory.parts(config);

const grep = (id: string, pattern: string) =>
  part.response(Response.anyToolCallPart({ id, name: "grep", params: { pattern } }));

const read = (id: string, path: string) =>
  part.response(Response.anyToolCallPart({ id, name: "read_file", params: { path } }));

const edit = (id: string, path: string) =>
  part.response(Response.anyToolCallPart({ id, name: "edit_file", params: { path } }));

const answered = (id: string, name: string, result: string) =>
  part.response(Response.anyToolResultPart({ id, name, result, isFailure: false }));

const said = (text: string) => part.response(Response.makePart("text", { text }));

const finished = (reason: Response.FinishReason, inputTokens: number, outputTokens: number) =>
  part.response(
    Response.makePart("finish", {
      reason,
      usage: new Response.Usage({
        inputTokens: { total: inputTokens },
        outputTokens: { total: outputTokens },
      }),
    }),
  );

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

    // The run compacts its context here.
    // Event.contextManagement records that compaction as an event, not a message.
    part.event(Event.contextManagement({ type: "compaction", boundary: "replace" })),

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

const open = (openedBy: string, at: number): PhaseDraft => ({
  openedBy,
  at,
  prompts: 0,
  responses: 0,
  parts: 0,
  tools: new Map(),
  paths: new Set(),
});

/** The path a `read_file` call reads, where the part is one. */
const readPath = (call: Response.ToolCallOf<typeof config>): string | undefined =>
  Match.value(call).pipe(
    Match.discriminator("name")("read_file", ({ params }) => params.path),
    Match.orElse(() => undefined),
  );

const main = Effect.fn(function* () {
  const session = yield* Session.main(trajectory);

  const draft = yield* session.stream.pipe(
    // View.steps keeps the event in order with the prompts and the responses.
    View.steps,
    Stream.runFold(
      (): ReportDraft => ({
        steps: { prompt: 0, response: 0, event: 0 },
        phases: [open("run", 1)],
        firstRead: new Map(),
        rediscovered: new Set(),
      }),
      (draft, step) => {
        const phaseIndex = draft.phases.length - 1;
        const phase = draft.phases[phaseIndex];

        // Steps state no ordinal, so the counts number them.
        const at = draft.steps.prompt + draft.steps.response + draft.steps.event + 1;

        switch (step._tag) {
          case "Event": {
            draft.steps.event += 1;

            // An event ends the phase it happened in.
            draft.phases.push(open(step.event.event.data.type, at + 1));

            return draft;
          }

          case "Prompt": {
            draft.steps.prompt += 1;
            phase.prompts += 1;

            return draft;
          }

          case "Response": {
            draft.steps.response += 1;
            phase.responses += 1;
            phase.parts += step.response.length;

            for (const responsePart of step.response) {
              if (responsePart.type !== "tool-call") continue;

              phase.tools.set(responsePart.name, (phase.tools.get(responsePart.name) ?? 0) + 1);

              const path = readPath(responsePart);

              if (path === undefined) continue;

              const readPhase = draft.firstRead.get(path);

              // Remember the first phase; a read in another phase is a re-read.
              if (readPhase === undefined) draft.firstRead.set(path, phaseIndex);
              else if (readPhase !== phaseIndex) draft.rediscovered.add(path);

              phase.paths.add(path);
            }

            return draft;
          }
        }
      },
    ),
  );

  return {
    steps: { ...draft.steps },

    phases: draft.phases.map(({ tools, paths, ...phase }): Phase => ({
      ...phase,
      tools: Object.fromEntries(tools),
      paths: [...paths],
    })),

    rediscovered: [...draft.rediscovered],
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
          paths: ["src/config.ts"],
        },
        {
          openedBy: "compaction",
          at: 6,
          prompts: 2,
          responses: 2,
          parts: 7,
          tools: { read_file: 1, edit_file: 1 },
          paths: ["src/config.ts"],
        },
      ]);

      expect(rediscovered).toEqual(["src/config.ts"]);
    }),
  ),
);
