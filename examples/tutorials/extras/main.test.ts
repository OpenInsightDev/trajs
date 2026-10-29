import { expect, it } from "@effect/vitest";
import { Extra, ExtraKit, Prompt, Response, Trajectory, VersionedSchema } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Match, Schema, SchemaGetter, Stream } from "effect";

/** The fields the harness wrote of a step, before `model_name` became `model`. */
const stepAt1 = Schema.Struct({
  version: Schema.Literal("1"),
  model_name: Schema.String,
  effort: Schema.Literals(["low", "high"]),
}).pipe(VersionedSchema.make);

/** The fields the harness writes of a step now. */
const step = stepAt1.pipe(
  VersionedSchema.upgrade(
    () => ({
      version: Schema.Literal("2"),
      model: Schema.String,
      effort: Schema.Literals(["low", "high"]),
    }),
    {
      decode: SchemaGetter.transform((previous) => ({
        version: "2" as const,
        model: previous.model_name,
        effort: previous.effort,
      })),
    },
  ),
);

/** The fields the harness wrote of the run itself. */
const run = Schema.Struct({
  version: Schema.Literal("1"),
  agent: Schema.String,
  task: Schema.String,
}).pipe(VersionedSchema.make);

// `tag` is `packageName` and `id` joined, and the key a part's fields are held
// under. This declaration states a payload for responses alone, so a prompt
// carries no step field.
const stepExtra = new Extra.Extra({ packageName: "tutorial", id: "Step", response: step });

const runExtra = new Extra.Extra({ packageName: "tutorial", id: "Run", session: run });

// A kit is the set of declarations a trajectory is read with. A read with a kit
// that does not declare a field leaves that field out.
const extrakit = ExtraKit.make(stepExtra, runExtra);

const config = Config.config({ extrakit });

const part = Trajectory.parts(config);

interface Turn {
  /** The model that produced the answer. */
  readonly model: string;

  /** The effort the harness called it with. */
  readonly effort: Schema.Schema.Type<typeof step>["effort"];

  /** The tool the answer called, or `null` where it called none. */
  readonly tool: string | null;
}

interface Summary {
  /** The agent that produced the run, and the task it was given. */
  readonly run: Readonly<{ agent: string; task: string }> | null;

  /** One turn per answer the harness recorded. */
  readonly turns: ReadonlyArray<Turn>;
}

// The harness wrote the first turn's record before `model_name` became `model`.
// A stored part's fields are read through this schema, so the migration runs here.
const searchedTurn = Schema.decodeUnknownSync(Extra.ExtraRecord(extrakit, "response"))({
  [stepExtra.tag]: { version: "1", model_name: "gpt-4.1-mini", effort: "low" },
});

// The second turn was written with today's fields.
const answeredTurn = {
  [stepExtra.tag]: step.make({ version: "2", model: "gpt-4.1", effort: "high" }),
};

const trajectory = Trajectory.make(config)(
  Stream.fromArray([
    part.mainSession({
      [runExtra.tag]: run.make({ version: "1", agent: "cline@3.1.0", task: "t-204" }),
    }),
    part.prompt(Prompt.make("Where is `TIMEOUT_MS` read? Search the repository.")),
    // Extra fields are passed beside the options, not under an `extra` key.
    part.response(
      Response.anyToolCallPart({
        id: "call_grep",
        name: "grep",
        params: { pattern: "TIMEOUT_MS" },
      }),
      searchedTurn,
    ),
    part.response(
      Response.anyToolResultPart({
        id: "call_grep",
        name: "grep",
        isFailure: false,
        result: "src/config.ts:12",
      }),
    ),
    part.prompt(Prompt.make("Which default does it fall back to?")),
    part.response(Response.makePart("text", { text: "Thirty seconds." }), answeredTurn),
  ]),
);

const main = trajectory.pipe(
  Stream.runFold(
    (): Summary => ({ run: null, turns: [] }),
    (summary, value) =>
      Match.value(value).pipe(
        Match.tag("Session", (session) => {
          // Every declared field is optional: a part may carry none of them.
          const recorded = session.extra[runExtra.tag];

          return recorded === undefined
            ? summary
            : { ...summary, run: { agent: recorded.agent, task: recorded.task } };
        }),
        Match.tag("Response", (response) => {
          const recorded = response.extra[stepExtra.tag];

          if (recorded === undefined) return summary;

          return {
            ...summary,
            turns: [
              ...summary.turns,
              {
                model: recorded.model,
                effort: recorded.effort,
                tool: response.response.type === "tool-call" ? response.response.name : null,
              },
            ],
          };
        }),
        Match.orElse(() => summary),
      ),
  ),
);

it.effect("main", () =>
  Effect.map(main, (summary) =>
    expect(summary).toEqual({
      run: { agent: "cline@3.1.0", task: "t-204" },
      turns: [
        // `model_name` was read as `model`: the record was written at version 1
        // and the declaration migrates it.
        { model: "gpt-4.1-mini", effort: "low", tool: "grep" },
        { model: "gpt-4.1", effort: "high", tool: null },
      ],
    } satisfies Summary),
  ),
);
