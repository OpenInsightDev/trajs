/**
 * An ATIF document read as a recording.
 *
 * {@link of} reads a {@link Document.Document} as the `@trajs/core` trajectory it
 * states, so a `trajectory.json` a program that ran a model elsewhere wrote is a
 * trajectory like any other: {@link Step.steps} reads it back as the steps it was
 * read from, and every other reader of a trajectory — `View`, `Session`, the codec
 * extensions that write one as a provider's API takes it, the kits a run records
 * with — reads it as one.
 *
 * What is read of a document is the conversation its steps hold. What a document
 * states beyond that — the ordinal of a step, the model that answered it, the
 * tokens it cost, the tools the agent was given, the subagent trajectories an
 * observation refers to — is not read: a recording holds the parts a session ran on
 * and what a kit derived of them, so a document read as one states what its steps
 * said and leaves what it says around them at the door rather than inventing a part
 * for it. {@link of} says of each field of the document what becomes of it.
 */

import { Event, Extra, Metric, Produce, Toolkit, Trajectory } from "@trajs/core";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";

import { record } from "#/internal/reading.ts";

import type { Document } from "./Document.ts";

/**
 * Reads an ATIF document as the recording it states.
 *
 * **When to use**
 *
 * Use when a run another program recorded as ATIF — the `trajectory.json` Harbor
 * writes for an agent it ran — is to be read on this package's own terms: to read it
 * step by step with {@link Step.steps}, to display it, to fold it back into the
 * prompt its model was given with {@link View.prompt}, or to hand it to a model
 * again with `@trajs/extension-anthropic` or `@trajs/extension-openai-compat`.
 *
 * **Details**
 *
 * The reading records the steps of the document with `Produce.produce`, one turn of
 * the recording per step: a step that states a message opens a turn with it, and an
 * agent step is recorded as the parts of a response — what the agent thought, what it
 * said, the tools it called, and the results of those calls — in the order the step
 * states them. A result that names no call answers the first call of its step that no
 * result has answered yet, since the calls of a step are answered in the order they
 * were made. A result beyond those calls is one of an action, which ATIF states
 * without a tool, so it is recorded under an id of its own and no tool name; one that
 * states no text either states nothing of the conversation a recording holds, and is
 * not recorded. Everything else the document states is left out rather than invented,
 * since a recording holds the parts a session ran on and what a kit derived of them
 * rather than a producer's account of one:
 *
 * - The ordinal of a step, the moment it happened, the model that answered it, what
 *   it cost, whether it repeats an earlier trajectory and how many inferences it
 *   stands for are the document's own account of the run. A recording times the parts
 *   it holds when they are recorded, names a model per turn where a model was run, and
 *   counts what a metric kit derives — none of which a document states.
 * - The tools an agent was given are stated in the format's own terms rather than as
 *   the tools of a toolkit, so the calls of a step are recorded as the calls they were
 *   and read as the tool parts the reading toolkit does not describe — see
 *   {@link Trajectory.UnknownConfig}.
 * - What a step holds beyond its text — an image, a recording of speech, the
 *   trajectory of a delegated subagent — is stated by a location or by another
 *   document, and neither is a part a recording holds.
 * - What a system step is answered with is an operation of the run rather than of the
 *   conversation, which a recording does not model yet.
 * - The context management a system step declares, which the package records as an
 *   event of its own — {@link Events.ContextManagement} — rather than as a field of a
 *   document. The reading states the system step and does not record the event yet.
 *
 * The session of the recording is named by `session_id`, or by `trajectory_id` where
 * the document states no run; a document that states neither is recorded in a session
 * of the reading's own. The recording states the agent that ran as its metadata, and
 * what a kit derives of its parts is nothing, since the kits it is read with name
 * nothing.
 *
 * The trajectory fails with the {@link TrajectoryError} a recording whose session
 * cannot be declared fails with, which a document of steps that one session records
 * does not.
 *
 * **Example** (Reading the run Harbor recorded for the `hello.txt` task)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, Stream } from "effect"
 * import { Document, Recording, Step } from "@trajs/extension-atif"
 *
 * // The steps of the `trajectory.json` Harbor's Claude Code adapter writes for the
 * // task of creating `hello.txt`, with the metrics of each step and the tools of the
 * // agent left out and the results shortened: the instruction, the call that wrote
 * // the file together with the result it was answered by, and what the agent said of
 * // it.
 * const document = Schema.decodeUnknownSync(Document.Document)({
 *   schema_version: "ATIF-v1.7",
 *   session_id: "d7d4e19e-608d-44ef-b166-cd050ef274ba",
 *   agent: { name: "claude-code", version: "2.1.222" },
 *   steps: [
 *     {
 *       step_id: 1,
 *       source: "user",
 *       message: 'Create a file called hello.txt with "Hello, world!" as the content.'
 *     },
 *     {
 *       step_id: 2,
 *       source: "agent",
 *       message: "",
 *       tool_calls: [
 *         {
 *           tool_call_id: "toolu_01Rmm2GPxpGq9Er31axjfYRv",
 *           function_name: "Write",
 *           arguments: { file_path: "/app/hello.txt", content: "Hello, world!\\n" }
 *         }
 *       ],
 *       observation: {
 *         results: [
 *           {
 *             source_call_id: "toolu_01Rmm2GPxpGq9Er31axjfYRv",
 *             content: "File created successfully at: /app/hello.txt"
 *           }
 *         ]
 *       }
 *     },
 *     { step_id: 3, source: "agent", message: "Created `/app/hello.txt`." }
 *   ]
 * })
 *
 * const recording = Recording.of(document)
 *
 * // The recording is a trajectory like any other: its steps read back as the ones
 * // the document holds, since a step's calls and their results are the parts it
 * // answered with, and the turns after the first open with no message of their own.
 * const steps = Array.from(await Effect.runPromise(Stream.runCollect(Step.steps(recording))))
 *
 * steps.map((step) => step.source) // => ["user", "agent", "agent"]
 * steps[1].toolCalls.map((call) => call.name) // => ["Write"]
 * steps[1].observations.map((result) => result.id) // => ["toolu_01Rmm2GPxpGq9Er31axjfYRv"]
 * recording.metadata.name // => "claude-code"
 * ```
 *
 * @see {@link Document.Document} for the document it reads.
 * @see {@link Step.steps} for reading the recording back as the steps it holds.
 * @see {@link Trajectory.UnknownConfig} for the kits the recording is read with.
 * @category constructors
 */
export const of = (
  document: Document,
): Trajectory.Trajectory<Trajectory.UnknownConfig, TrajectoryError, never> =>
  Produce.produce({
    toolkit: Toolkit.empty,
    eventkit: Event.makeKit(),
    // A kit that names no metric derives nothing, so the recording holds the parts
    // its steps were read as and no metric part.
    metrickit: Metric.toProducers(Metric.makeKit(), {}),
    extrakit: Extra.makeKit(),
    metadata: new Trajectory.Metadata({
      name: document.agent.name,
      description: `${document.schema_version} of ${document.agent.name} ${document.agent.version}`,
    }),
  })((producer) => record(producer, document));
