import { Prompt, Response, Trajectory } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Stream } from "effect";

const config = Config.config({ stream: false });

const part = Trajectory.parts(config);

const call = <Parameters>(id: string, name: string, params: Parameters) =>
  Response.anyToolCallPart({ id, name, params, providerExecuted: false });

const result = (id: string, name: string, answered: string) =>
  Response.anyToolResultPart({
    id,
    name,
    isFailure: false,
    providerExecuted: false,
    result: answered,
  });

const said = (text: string) => Response.makePart("text", { text });

const finished = (reason: Response.FinishReason, input: number, output: number) =>
  Response.makePart("finish", {
    reason,
    usage: new Response.Usage({
      inputTokens: { total: input },
      outputTokens: { total: output },
    }),
  });

const traced =
  "Which commits touched src/config.ts in the last two weeks, and what did they change?";

const read = "Read commit 9f2c1e and say what it changed about the timeout.";

const historyCall = part.response(
  call("call_history", "task", { agent: "historian", task: traced }),
);

const commitCall = part.response(call("call_commit", "task", { agent: "archivist", task: read }), {
  sessionId: "historian",
});

const commitAnswered =
  "9f2c1e made `readTimeout` read `TIMEOUT_MS` from the environment; CI sets none, so the timeout is `NaN`.";

const historyAnswered =
  "9f2c1e changed how the timeout is read, and CI sets no `TIMEOUT_MS`. Revert 9f2c1e.";

const parts = [
  part.prompt(
    Prompt.make(
      "The settings test fails on CI but passes locally. Where is the timeout read from?",
    ),
  ),
  part.response(call("call_grep", "grep", { pattern: "readTimeout" })),
  part.response(
    result(
      "call_grep",
      "grep",
      "src/config.ts:12:export const readTimeout = () => Number(process.env.TIMEOUT_MS);",
    ),
  ),
  part.response(finished("tool-calls", 1_820, 146)),
  part.prompt(Prompt.make("Read the module around it.")),
  part.response(call("call_read", "read_file", { path: "src/config.ts" })),
  part.response(
    result(
      "call_read",
      "read_file",
      "export const readTimeout = () => Number(process.env.TIMEOUT_MS);\nexport const settings = { timeout: readTimeout() };",
    ),
  ),
  part.response(finished("tool-calls", 2_140, 210)),
  part.prompt(
    Prompt.make(
      "Did anything change in how the timeout is read? Find the commit and say what to revert.",
    ),
  ),
  historyCall,
  part.response(finished("tool-calls", 2_560, 96)),

  part.subSession("historian", { fork: historyCall.uuid }),
  part.prompt(Prompt.make(traced), { sessionId: "historian" }),
  part.response(
    call("call_log", "bash", { command: "git log --since=2.weeks --oneline -- src/config.ts" }),
    { sessionId: "historian" },
  ),
  part.response(
    result(
      "call_log",
      "bash",
      "9f2c1e read TIMEOUT_MS from the environment\n4d81b0 format the config",
    ),
    { sessionId: "historian" },
  ),
  part.response(finished("tool-calls", 2_760, 180), { sessionId: "historian" }),
  commitCall,
  part.response(finished("tool-calls", 3_070, 120), { sessionId: "historian" }),

  part.subSession("archivist", { fork: commitCall.uuid }),
  part.prompt(Prompt.make(read), { sessionId: "archivist" }),
  part.response(call("call_show", "bash", { command: "git show 9f2c1e -- src/config.ts" }), {
    sessionId: "archivist",
  }),
  part.response(
    result(
      "call_show",
      "bash",
      "- export const readTimeout = () => 30_000;\n+ export const readTimeout = () => Number(process.env.TIMEOUT_MS);",
    ),
    { sessionId: "archivist" },
  ),
  part.response(finished("tool-calls", 3_880, 240), { sessionId: "archivist" }),
  part.response(said(commitAnswered), { sessionId: "archivist" }),
  part.response(finished("stop", 4_010, 140), { sessionId: "archivist" }),

  part.response(result("call_commit", "task", commitAnswered), { sessionId: "historian" }),
  part.response(said(historyAnswered), { sessionId: "historian" }),
  part.response(finished("stop", 3_940, 260), { sessionId: "historian" }),

  part.response(result("call_history", "task", historyAnswered)),
  part.response(
    said("Revert 9f2c1e: it reads `TIMEOUT_MS` from the environment, which CI does not set."),
  ),
  part.response(finished("stop", 4_180, 320)),
];

export const trajectory = Trajectory.make(config)(Stream.fromArray(parts));
