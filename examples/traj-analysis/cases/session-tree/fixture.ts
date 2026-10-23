/**
 * The trajectory the case is of: one run of an agent asked why a test fails on CI, and the sessions
 * it forked off other agents to find out.
 *
 * A session is forked at the part it continues from, and a sub-agent is forked at the call that
 * started it: the `historian` continues the mainline up to the `task` call the mainline made, and
 * the `archivist` continues the historian up to its own. The sessions are declared here rather than
 * produced by `Produce.fromSessions`, which forks a session at the declaration of the one it names;
 * a run that delegates forks at the call instead, so what a sub-agent inherits is the conversation
 * the call was made in.
 *
 * A `finish` part carries what a provider reported of the request it ended, and the input of a
 * request is the whole conversation that request was given: how a session grew is read off the
 * parts it produced rather than estimated here.
 *
 * The parts are built here rather than read from a `.trajs` file so the case stands on its own; a
 * run recorded by an exchange is the same parts, read through the trajectory an `Exchange` loaded.
 */

import { Prompt, Response, Trajectory } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Stream } from "effect";

/** What the run is built and read with: whole response parts, and no kit of its own. */
const config = Config.config({ stream: false });

/** The builders of the parts of the run. */
const part = Trajectory.parts(config);

/** A call the run made of a tool: what the agent asked for, in the tool's own terms. */
const call = <Parameters>(id: string, name: string, params: Parameters) =>
  Response.anyToolCallPart({ id, name, params, providerExecuted: false });

/** What a tool answered a call with. */
const result = (id: string, name: string, answered: string) =>
  Response.anyToolResultPart({
    id,
    name,
    isFailure: false,
    providerExecuted: false,
    result: answered,
  });

/** What a model said of its own. */
const said = (text: string) => Response.makePart("text", { text });

/** What a provider reported of the request a part ended, and why the request ended. */
const finished = (reason: Response.FinishReason, input: number, output: number) =>
  Response.makePart("finish", {
    reason,
    usage: new Response.Usage({
      inputTokens: { total: input },
      outputTokens: { total: output },
    }),
  });

/** What the mainline asked the historian for, which the call it made and the historian's prompt state. */
const traced =
  "Which commits touched src/config.ts in the last two weeks, and what did they change?";

/** What the historian asked the archivist for, which its call and the archivist's prompt state. */
const read = "Read commit 9f2c1e and say what it changed about the timeout.";

/** What the mainline called to delegate the history of the config, which the historian continues from. */
const historyCall = part.response(
  call("call_history", "task", { agent: "historian", task: traced }),
);

/** What the historian called to delegate one commit, which the archivist continues from. */
const commitCall = part.response(call("call_commit", "task", { agent: "archivist", task: read }), {
  sessionId: "historian",
});

/** What the archivist answered, which the call the historian made returned. */
const commitAnswered =
  "9f2c1e made `readTimeout` read `TIMEOUT_MS` from the environment; CI sets none, so the timeout is `NaN`.";

/** What the historian answered, which the call the mainline made returned. */
const historyAnswered =
  "9f2c1e changed how the timeout is read, and CI sets no `TIMEOUT_MS`. Revert 9f2c1e.";

/** The parts of the run, in the order the trajectory holds them. */
const parts = [
  // The mainline: what it was asked, and what it called to answer.
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

  // The historian: forked off the call the mainline made.
  // The declaration comes after the part it continues from and before the parts it produces, which
  // is what places the fork in the run.
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

  // The archivist: forked off the call the historian made.
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

  // The historian, answered by the archivist and answering the mainline.
  // The result of a delegation is produced in the session that made the call, after the parts of the
  // session it forked off: a fork inherits the call, never the answer the call returned.
  part.response(result("call_commit", "task", commitAnswered), { sessionId: "historian" }),
  part.response(said(historyAnswered), { sessionId: "historian" }),
  part.response(finished("stop", 3_940, 260), { sessionId: "historian" }),

  // The mainline, answered by the historian.
  part.response(result("call_history", "task", historyAnswered)),
  part.response(
    said("Revert 9f2c1e: it reads `TIMEOUT_MS` from the environment, which CI does not set."),
  ),
  part.response(finished("stop", 4_180, 320)),
];

/** The run as the trajectory the analysis reads: the parts above, in the sessions they were produced in. */
export const trajectory = Trajectory.make(config)(Stream.fromArray(parts));
