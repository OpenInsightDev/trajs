/**
 * An ATIF document read as a trajectory.
 *
 * {@link encode} reads a {@link Document.Document} as the `@trajs/core` trajectory it
 * states, and {@link fromFile} does the same for the `trajectory.json` a path names,
 * so a run a program that ran a model elsewhere produced is a trajectory like any
 * other: {@link Step.steps} reads it back as the steps it was read from, and every
 * other reader of a trajectory — `View`, `Session`, the codec extensions that write
 * one as a provider's API takes it, the kits a run produces with — reads it as one.
 *
 * What is read of a document is the conversation its steps hold, the media a step states
 * the bytes of, the tools its agent was given — which a trajectory names as the toolkit
 * it was run with rather than as parts of it — and what the document states around that
 * conversation as extra data on the part it belongs to. What remains — the trajectory of a
 * run a step delegates to or continues, whether a step repeats an earlier one, what a
 * system step is answered with, and the context management it declares — is stated by
 * another document rather than by the parts of a trajectory, so it is not read:
 * {@link encode} says of each field of the document what becomes of it.
 */

import { EventKit, MetricKit, Produce, type Toolkit, Trajectory } from "@trajs/core";
import { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect, FileSystem, Path, Schema } from "effect";
import type { PlatformError } from "effect";

import { produce } from "#/internal/reading.ts";
import { toolkitOf } from "#/internal/toolkit.ts";

import { FromJson } from "./Document.ts";
import type { Document } from "./Document.ts";
import { extrakit } from "./Extras.ts";

/**
 * What a document is read with beside the document itself.
 *
 * **When to use**
 *
 * Use when a document states the media of its steps by a path, and those paths are to
 * be read from a directory rather than from wherever the program happens to run.
 *
 * **Details**
 *
 * `cwd` is the directory the paths a document states are read from, and is left out
 * where they are to be read as the program states them: a path that is absolute is
 * read as it is stated either way. ATIF states the path of an image or a recording
 * relative to the document, so a program that read a document from a file names the
 * directory of that file — `dirname(path)` — to read the media the document states
 * beside it.
 *
 * @see {@link encode} for the reading the options are given to.
 * @category models
 */
export interface Options {
  /** Where the paths a document states are read from, relative paths among them. */
  readonly cwd?: string;
}

/**
 * Reads an ATIF document as the trajectory it states.
 *
 * **When to use**
 *
 * Use when a run another program produced as ATIF — the `trajectory.json` Harbor
 * writes for an agent it ran — is to be read on this package's own terms: to read it
 * step by step with {@link Step.steps}, to display it, to fold it back into the
 * prompt its model was given with {@link View.prompt}, or to hand it to a model
 * again with `@trajs/extension-anthropic` or `@trajs/extension-openai-compat`.
 *
 * **Details**
 *
 * The reading produces the steps of the document with `Produce.produce`, one turn of
 * the trajectory per step: a step that states a message opens a turn with it, and an
 * agent step is produced as the parts of a response — what the agent thought, what it
 * said, the tools it called, and the results of those calls — in the order the step
 * states them. A result that names no call answers the first call of its step that no
 * result has answered yet, since the calls of a step are answered in the order they
 * were made. A result beyond those calls is one of an action, which ATIF states
 * without a tool, so it is produced under an id of its own and no tool name; one that
 * states nothing — no call, no text and no bytes — states nothing of the conversation a
 * trajectory holds, and is not produced.
 *
 * What the document states of a step beyond what it says, and of the run itself, is
 * carried as extra data on the part it belongs to: the ordinal of a step, the model
 * that answered it, the effort it took, how many inferences it stands for, what it
 * cost, and the extra a producer wrote of it are the {@link Extras.StepFields} of the
 * part of that step — the prompt part of a step that states a message, and the first
 * response part of a step that answered with parts — while the version of the format,
 * the agent that ran, its notes, its final metrics and its own extra are the
 * {@link Extras.DocumentFields} of the session part. A step is timed with the moment
 * the document gives it, which is the `timestamp` of the part of that step. A reader
 * installs {@link Extras.extrakit} to read those fields with their types, and one that
 * names no such kit reads the parts without them, since a kit reads back what it
 * declares and nothing else.
 *
 * A step that answered with nothing where the turn before it was open has no part of
 * its own, so what the document states of it is not carried: the account of a step
 * hangs on the part the reading produced for it.
 *
 * An image or a recording a step states is read from the path the document states it
 * at, and produced as a `file` part of the step that states it: of the message a model
 * was given, of what the agent answered with, or of what a result was answered with.
 * The bytes come from the file system the trajectory is read with, which the reading
 * therefore requires and fails with where a path cannot be read; a path that is
 * relative is read under the `cwd` the reading is given, and as the document states it
 * where no directory is given or the path is absolute — see {@link Options}. A
 * `system` step states text alone, so the media of one is not read.
 *
 * The tools the document says its agent was given are read: a document states them in
 * the format's own terms — the name each is called by, what it does, and the JSON
 * schema of the arguments it accepts — which is what a dynamic tool is built from, so
 * the trajectory names the tools its agent was run with rather than none, and a call
 * of a step is read as the call of the tool it names — see {@link Toolkit}.
 *
 * What a document states in the terms of a kit the reading does not name is left out
 * rather than invented, since a trajectory holds the parts a session ran on and what a
 * kit derived of them rather than a producer's account of one:
 *
 * - The trajectory of a delegated or continued run is another document rather than a
 *   part a trajectory holds, so a reference to one is not followed: it is read as the
 *   result it is stated on and no further.
 * - Whether a step repeats an earlier trajectory, which ATIF states of a step a
 *   producer copied into the one it continues. The reading does not rebuild the
 *   sessions a document continues or delegates to yet, so a copied step is read as a
 *   step of the document that states it, and the marker is not carried.
 * - What a system step is answered with is an operation of the run rather than of the
 *   conversation, which a trajectory does not model yet.
 * - The context management a system step declares, which the package produces as an
 *   event of its own — {@link Events.ContextManagement} — rather than as a field of a
 *   document. The reading states the system step and does not produce the event yet.
 *
 * The session of the trajectory is named by `session_id`, or by `trajectory_id` where
 * the document states no run; a document that states neither is produced in a session
 * of the reading's own. The trajectory names the toolkit of the document and the extra
 * data of this package and no other kit, so it holds no event and no metric part, and
 * derives nothing of the parts it holds.
 *
 * The trajectory fails with the {@link TrajectoryError} a trajectory whose session
 * cannot be declared fails with, which a document of steps that one session produces
 * does not, and with the failure of reading a path the document states for an image or
 * a recording.
 *
 * **Example** (Reading the run Harbor produced for the `hello.txt` task)
 *
 * ```ts import.meta.vitest
 * import { Effect, FileSystem, Layer, Option, Path, Schema, Stream } from "effect"
 * import { Trajectory } from "@trajs/core"
 * import { Document, Encode, Step, stepExtra } from "@trajs/extension-atif"
 *
 * // The `trajectory.json` Harbor's Claude Code adapter writes for the task of
 * // creating `hello.txt`, with the tools of the agent shortened to the one the step
 * // called and the results shortened: the instruction, the call that wrote the file
 * // together with the result it was answered by, and what the agent said of it.
 * const document = Schema.decodeUnknownSync(Document.Document)({
 *   schema_version: "ATIF-v1.7",
 *   session_id: "d7d4e19e-608d-44ef-b166-cd050ef274ba",
 *   agent: {
 *     name: "claude-code",
 *     version: "2.1.222",
 *     tool_definitions: [
 *       {
 *         type: "function",
 *         function: {
 *           name: "Write",
 *           description: "Writes a file to the local filesystem.",
 *           parameters: {
 *             type: "object",
 *             properties: { file_path: { type: "string" }, content: { type: "string" } },
 *             required: ["file_path", "content"]
 *           }
 *         }
 *       }
 *     ]
 *   },
 *   steps: [
 *     {
 *       step_id: 1,
 *       timestamp: "2026-01-01T00:00:00Z",
 *       source: "user",
 *       message: 'Create a file called hello.txt with "Hello, world!" as the content.'
 *     },
 *     {
 *       step_id: 2,
 *       timestamp: "2026-01-01T00:00:04Z",
 *       source: "agent",
 *       model_name: "claude-sonnet-4",
 *       message: "",
 *       metrics: { prompt_tokens: 12, completion_tokens: 3 },
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
 * const trajectory = Encode.encode(document)
 *
 * // The tools the document says the agent was given are the toolkit the trajectory
 * // names, and the call of the step is read as the call of the tool it names.
 * Object.keys(trajectory.toolkit.tools) // => ["Write"]
 *
 * // The trajectory is a trajectory like any other: the session it names reads back as
 * // the steps the document holds, since a step's calls and their results are the parts
 * // it answered with, and the turns after the first open with no message of their own.
 * // The reading needs the file system and the paths of the program it runs in; a
 * // document that names no image and no recording is read with any of them.
 * const sessions = await Effect.runPromise(Trajectory.toSessions(trajectory))
 * const session = Option.getOrThrow(Trajectory.session(document.session_id)(sessions))
 *
 * const steps = Array.from(
 *   await Effect.runPromise(
 *     Stream.runCollect(Step.steps(session.stream)).pipe(
 *       Effect.provide(Layer.merge(FileSystem.layerNoop({}), Path.layer))
 *     )
 *   )
 * )
 *
 * steps.map((step) => step.source) // => ["user", "agent", "agent"]
 * steps[1].toolCalls.map((call) => call.name) // => ["Write"]
 * steps[1].observations.map((result) => result.id) // => ["toolu_01Rmm2GPxpGq9Er31axjfYRv"]
 *
 * // What the document states of the run and of its steps is carried as extra data on
 * // the parts of the trajectory, which a reader that installs this package's kit reads
 * // with their types: the ordinal of a step, the model that answered it, what it cost,
 * // and the moment it happened.
 * const parts = Array.from(await Effect.runPromise(Stream.runCollect(trajectory)))
 * const asked = parts.filter((part) => part._tag === "Prompt")
 * const answered = parts.filter((part) => part._tag === "Response")
 *
 * asked[0].extra[stepExtra.tag]?.step_id // => 1
 * asked[0].timestamp !== undefined // => true
 * answered[0].extra[stepExtra.tag]?.model_name // => "claude-sonnet-4"
 * answered[0].extra[stepExtra.tag]?.metrics?.completion_tokens // => 3
 * ```
 *
 * @see {@link Document.Document} for the document it reads.
 * @see {@link Options} for the directory its paths are read from.
 * @see {@link fromFile} for reading a document from the file it is held in.
 * @see {@link Step.steps} for reading the trajectory back as the steps it holds.
 * @see {@link Extras.StepFields} for what a document states of a step.
 * @see {@link Extras.DocumentFields} for what it states of a run.
 * @see {@link Extras.extrakit} for the kit the trajectory is read with.
 * @see {@link Trajectory.Config} for the kits the trajectory is read with.
 * @category constructors
 */
export const encode = (
  document: Document,
  options?: Options,
): Trajectory.Trajectory<
  string,
  Trajectory.Config<
    true,
    Toolkit.Any,
    EventKit.Empty,
    MetricKit.WithProducers<MetricKit.Empty>,
    typeof extrakit
  >,
  TrajectoryError | PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> => kits(document)((producer) => produce(producer, document, options?.cwd));

/**
 * Reads the ATIF document a file holds, as the trajectory it states.
 *
 * **When to use**
 *
 * Use when the run another program produced is a `trajectory.json` on disk — the one
 * Harbor writes for an agent it ran — so that reading it takes one call rather than
 * reading the file, decoding it as a {@link Document.Document} and encoding that
 * yourself.
 *
 * **Details**
 *
 * The file is read as the JSON it holds and decoded as a document — the schema
 * {@link Document.FromJson} states — which is then read as {@link encode} reads one,
 * with the paths the document states for its media read beside it: ATIF states such a
 * path relative to the document, and the document of a file lies where the file does.
 * A program that holds the document already, or that reads its media from somewhere
 * else, reads it with {@link encode} and the directory of its own.
 *
 * What the document states of its agent is read before the trajectory is made, since
 * the tools an agent was given are the toolkit the trajectory is read with: the reading
 * is the effect this returns, and the trajectory it produces names them. A file that
 * cannot be read fails the effect with what that file system fails with, and one that
 * holds no ATIF document fails it with the {@link TrajectoryError} of a trajectory
 * whose bytes are not a trajectory.
 *
 * The trajectory itself requires the file system and the paths of the program it is
 * read in, as the one {@link encode} reads a document into does.
 *
 * @see {@link encode} for reading a document that is decoded already.
 * @see {@link Document.FromJson} for the JSON the file is read as.
 * @category constructors
 */
export const fromFile = (
  path: string,
): Effect.Effect<
  Trajectory.Trajectory<
    string,
    Trajectory.Config<true, Toolkit.Any, EventKit.Empty, MetricKit.Empty, typeof extrakit>,
    TrajectoryError | PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path
  >,
  TrajectoryError | PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;

    const document = yield* Schema.decodeUnknownEffect(FromJson)(
      yield* fs.readFileString(path),
    ).pipe(Effect.mapError(TrajectoryError.parse));

    return encode(document, { cwd: paths.dirname(path) });
  });

/**
 * The config a document is produced with: the toolkit it says its agent was given, and the
 * extra data this package carries.
 *
 * Nothing else is derived of the parts a document is read as — no event is produced and
 * no metric counted — so a trajectory read from a document holds the parts its steps were
 * read as, the toolkit they were run with, and what the document states of them.
 */
const kits = (document: Document) =>
  Produce.produce(
    Trajectory.config({
      stream: true,
      toolkit: toolkitOf(document),
      eventkit: EventKit.empty,
      // A kit that names no metric derives nothing, so the trajectory holds the parts
      // its steps were read as and no metric part.
      metrickit: MetricKit.toProducers(MetricKit.empty, {}),
      // The extra data of this package, so what a document states of a run and of its
      // steps reads back as the fields they are rather than as the JSON they were written
      // as.
      extrakit,
    }),
  );
