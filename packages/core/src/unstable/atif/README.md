# @trajs/core/unstable/atif

A trajectory in the terms of [ATIF](https://docs.harborframework.com/agents/atif),
the Agent Trajectory Interchange Format Harbor writes its agents' runs with.

ATIF carries a run as one ordered list of steps — a system prompt, a user
message, or a complete agent turn — and Harbor writes it to `trajectory.json`,
which its results viewer reads and its agents load. `Document` states that
format, as the schemas a `trajectory.json` is decoded by. `Step.steps` derives
that list from a `@trajs/core` trajectory, so a trajectory can be read as the steps
the format exchanges, and `Encode.encode` reads the other way: a document is read
as the trajectory it states, so a run another program produced is a trajectory
like any other. The extension of _Context management events_ below carries what
ATIF states of a run of its own. What a
document states and a trajectory does not hold is left to whoever writes the
document; _What a step holds_ below says where that gap is, from the side of a
step.

## Usage

```ts
import { Step } from "@trajs/core/unstable/atif";
import { Effect, Stream } from "effect";

const steps = await Effect.runPromise(Stream.runCollect(Step.steps(trajectory)));

// One step per message a model was given, one for the turn that answered them.
steps.map((step) => step.source); // => ["user", "agent"]
```

`Step.steps` reads the steps of `View.steps` of `@trajs/core`, so a step is
derived from the parts a trajectory arrived in: a run of response parts ends
at the prompt or event that follows it. As in `View.steps`, a trajectory that
interleaves several sessions is read one session at a time.

## Reading a document

`Encode.fromFile` reads the `trajectory.json` a path names as the trajectory it
states, and `Encode.encode` reads a document that is decoded already — the same
reading either way: the steps of the document are produced as the turns of a
trajectory with `Produce.produce`, so a `trajectory.json` a program that ran
elsewhere wrote is a trajectory like any other — `View`, `Session.main`, the codec
extensions and the metric kits read it as one, and `Step.steps` reads back the steps
it was read from. The document is stated as the schemas ATIF states it in, so what a
file holds is decoded before it is read.

```ts
import { NodeServices } from "@effect/platform-node";
import { Encode, Step } from "@trajs/core/unstable/atif";
import { Effect, Stream } from "effect";

const steps = await Effect.runPromise(
  Effect.gen(function* () {
    const trajectory = yield* Encode.fromFile("runs/one/trajectory.json");

    return yield* Stream.runCollect(Step.steps(trajectory));
  }).pipe(Effect.provide(NodeServices.layer)),
);
```

`fromFile` reads and decodes the file when the effect it returns is run — the tools a
document says its agent was given are the toolkit the trajectory is read with, so
the trajectory is made once the document is read — and the trajectory it produces is
as lazy as any other.

A program that holds the document already — one that decoded it or built it — reads
it with `Encode.encode`, and names the directory its paths are read from:

```ts
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Document, Encode } from "@trajs/core/unstable/atif";
import { Schema } from "effect";

const path = "runs/one/trajectory.json";
const json = await readFile(path, "utf8");
const document = Schema.decodeUnknownSync(Document.FromJson)(json);
const trajectory = Encode.encode(document, { cwd: dirname(path) });
```

One step of the document is one turn of the trajectory: a step that states a
message opens a turn with it, and an agent step is produced as the parts of a
response — what the agent thought, what it said, the tools it called, and the
results those calls were answered with, in the order the step states them. ATIF
states one step per inference, so a step that follows the answer of a turn opens a
turn of its own with no message in it: the model was called again on the same
messages with the results of the calls in between, which are the parts produced
before it. A result that names no call answers a call of its step that no result
has answered yet, since the calls of a step are answered in the order they were
made — a document that leaves the id of a result out still says which call was
answered when a step made one call. The session of the trajectory is named by the
document's `trajectory_id`, or `"atif"` where it states none. `session_id` is the
identity of the run the document belongs to rather than of the document — every
document of one run states the same value — so the reading does not use it yet.

An image or a recording a step states is read from the path the document states it
at and produced as the `file` part of the step it is stated on: a part of the
message a model was given, of what the agent answered with, or of what a result was
answered with. ATIF states such a path beside the document, so a document read from
a file has its media read beside it, and one read from a document of your own is
read with the directory its options name. The seconds a recording lasts is the
`MediaFields` duration of that part, keyed by the ordinal of the media among the ones
the part states. A `system` message states text alone, so the media of one is not
read.

The tools the document says its agent was given are read, as the toolkit the
trajectory names: each tool definition becomes a dynamic tool — the name it is
called by, what it does, and the JSON schema of the arguments it accepts — so a
trajectory read from a document says what its agent was run with, and whoever writes
the trajectory states the same tools in the header it starts with. What a definition
states besides the tool — its `type`, its `strict` and the `extra` a producer wrote —
is `DocumentFields`'s `agent.tool_definitions`, by the name each tool is called by.

What a document states of a step beyond what it says, of a call, of a result and of
the run itself, is carried as extra data on the part it belongs to:

- the ordinal of a step, the model that answered it, the effort it took, how many
  inferences it stands for, what it cost, and the `extra` a producer wrote of
  anything are the `StepFields` of the part of that step — the prompt part of a step
  that states a message, the first response part of a step that answered with parts.
  The moment a step happened times the part of that step.
- the `extra` a producer wrote of a tool call is the `CallFields` of the response
  part of that call, which a call is a part of its own.
- the call a result states it answers and the `extra` a producer wrote of it are the
  `ResultFields` of the response part of that result.
- the version of the format, the agent that ran, the `notes` of the run, its
  `final_metrics` and its own `extra` are the `DocumentFields` of the session part.

A reader installs the kits a trajectory declares with — `extrakit` and `eventkit` —
and reads those fields off the part with their types:

```ts
import { Extra } from "@trajs/core/unstable/atif";
import { Effect, Predicate, Stream } from "effect";

const parts = Array.from(await Effect.runPromise(Stream.runCollect(trajectory)));
const session = parts.find((part) => Predicate.isTagged("Session")(part));
const answered = parts.find((part) => Predicate.isTagged("Response")(part));
const called = parts.find(
  (part) => Predicate.isTagged("Response")(part) && part.response.type === "tool-call",
);

session?.extra[Extra.documentExtra.tag]?.agent.name; // => "claude-code"
answered?.extra[Extra.stepExtra.tag]?.model_name; // => "claude-sonnet-4"
called?.extra[Extra.callExtra.tag]?.extra; // => { retries: 1 }
```

What a document states in the terms of a kit the reading does not name is left out,
because a trajectory holds the parts a session ran on and what a kit derived of them
rather than a producer's account of a run:

- the identity of the run the document belongs to: every document of one run
  states the same `session_id`, so it names no document and the reading leaves it
  out. _Reading a document_ above says how the session is named instead.
- the trajectory of a delegated or continued run, which a document states by another
  document rather than by a part of its own.
- whether a step repeats an earlier trajectory, which the format states of a step a
  producer copied into the one it continues: the reading does not rebuild the
  sessions a document continues or delegates to yet, so a copied step is read as a
  step of the document that states it and the marker is not carried.
- what a system step is answered with, which is an operation of the run rather than
  of the conversation.
- the context management a system step declares, which this module produces as an
  event of its own rather than as a field of a document.

## Context management events

ATIF produces what happens of a run, rather than what is said, as system steps,
and states what some of them do as a convention of its own. The one ATIF v1.8
defines is context management: a step that transforms the agent's context window
declares a `context_management` object of a `type` — `compaction`, `pruning` or
`injection` — and a `boundary` — `replace`, `append` or `truncate`. The module
declares that convention as the `ContextManagement` event, so a run that
transforms its context produces the event among the parts of its own trajectory
rather than in a field of the ATIF document.

```ts
import { Config, MetricKit, Produce, Trajectory } from "@trajs/core";
import { Event } from "@trajs/core/unstable/atif";
import { Stream } from "effect";

const config = Config.config({
  eventkit: Event.eventkit,
  metrickit: MetricKit.toProducers(MetricKit.empty, {}),
});

// The event is what a system part carries, and the session produces it where it
// happened.
const part = Trajectory.parts(config).event(
  Event.contextManagement({ type: "compaction", boundary: "replace" }),
);

const produced = Produce.fromSession(config)(Stream.make(part));
```

A reader installs `Event.eventkit` in the config it reads the trajectory with, and
the event is read back as `ContextManagement` data: a reading that names no event
reads no event part at all. The event states the transformation rather than the
context it left:
what a `replace` bound leaves is what the messages after it carry, and ATIF's
boundary rule is what says so.

## What a step holds

A step holds what a trajectory holds of the turn it is read from, which is the
conversation of that turn: `Step.steps` folds a trajectory into steps without reading
the extra data of the parts. What a document states of a step beyond what it says is
carried on the part of the step rather than on the step — see _Reading a document_
above for how a reader gets it back:

- `step_id`, `model_name`, `reasoning_effort`, `llm_call_count`, `metrics` and a
  step's `extra` are the extra data of the part of the step, and `timestamp` its
  moment, which `Step.steps` does not read back into a step yet. A step of a
  trajectory a run produced holds none of them unless the run declared them, so a
  writer that numbers its steps and times them does so from what it knows rather
  than from the step.
- `is_copied_context`, which a document states of a step a producer copied into the
  one it continues. This reading does not rebuild the sessions a document continues
  or delegates to yet, so a copied step is read as a step of the document that states
  it and the marker is not carried.
- Multimodal `message` and `content` parts, which ATIF added in v1.6. An image or
  a file is referenced by a path that sits beside the trajectory file, while a
  trajectory holds the bytes themselves: the bytes are the `file` part of the step,
  the seconds a recording lasts is the `MediaFields` of that part, and the path is
  what neither states.
- `observation.subagent_trajectory_ref`, and the `subagent_trajectories` a
  reference resolves against. A trajectory of delegated work is a trajectory of
  another session, which this module does not read as one document yet.

Two readings of a trajectory also deviate from the shape ATIF writes: an agent
step holds its tool results as `observations` rather than in the `observation`
object ATIF wraps them in, and a step's own tool calls and results are the
response parts of the trajectory rather than the `tool_calls` and
`observation.results` those parts encode to.

`Encode.encode` reads the other way, and states the same fields as the extra data of
the parts it makes: _Reading a document_ above says of each of them what becomes of
it.

## Development

The module is part of `@trajs/core`, so it is developed and checked from
`packages/core`: `vp check` reads it and `vp pack` builds it with the package.
