# @trajs/extension-atif

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
import { Effect, Stream } from "effect";
import { Step } from "@trajs/extension-atif";

const steps = await Effect.runPromise(Stream.runCollect(Step.steps(trajectory)));

// One step per message a model was given, one for the turn that answered them.
steps.map((step) => step.source); // => ["user", "agent"]
```

`Step.steps` reads the turns of `View.promptTurns` of `@trajs/core`, so a step is
derived from a turn rather than from the parts a trajectory arrived in: the
increments of a streamed response are folded into the parts they complete, and a
response part that no prompt precedes belongs to no turn and is dropped. As in
`View.promptTurns`, a trajectory that interleaves several sessions is read one
session at a time.

## Reading a document

`Encode.encode` reads an ATIF document as the trajectory it states: the steps of the
document are produced as the turns of a trajectory with `Produce.produce`, so a
`trajectory.json` a program that ran elsewhere wrote is a trajectory like any other
— `View`, `Session`, the codec extensions and the metric kits read it as one, and
`Step.steps` reads back the steps it was read from. The document is stated as the
schemas ATIF states it in, so what a file holds is decoded before it is read.

```ts
import { Schema } from "effect";
import { readFile } from "node:fs/promises";
import { Document, Encode } from "@trajs/extension-atif";

const json = await readFile("trajectory.json", "utf8");
const document = Schema.decodeUnknownSync(Document.FromJson)(json);
const trajectory = Encode.encode(document);
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
answered when a step made one call. The session of the trajectory is the run the
document states, or the document's own id where it states no run.

What a document states beyond the conversation is not read, because a trajectory
holds the parts a session ran on and what a kit derived of them rather than a
producer's account of a run:

- the ordinal of a step, the moment it happened, the model that answered it, what
  it cost, and how many inferences it stands for. A trajectory times no part of a
  conversation, names no model per turn, and counts no tokens or cost, so there is
  nothing to read them from.
- the tools the agent was given, which the document states in the format's own
  terms rather than as the tools of a toolkit. The calls of a step are produced as
  the calls they were, and are read as the tool parts the reading toolkit does not
  describe, since it names no tools.
- what a step holds beyond its text — an image, a recording of speech, the
  trajectory of a delegated subagent — which a document states by a location beside
  it or by another document, and a trajectory holds as neither.
- what a system step is answered with, which is an operation of the run rather than
  of the conversation.
- the context management a system step declares, which this package produces as an
  event of its own rather than as a field of a document.

## Context management events

ATIF produces what happens of a run, rather than what is said, as system steps,
and states what some of them do as a convention of its own. The one ATIF v1.8
defines is context management: a step that transforms the agent's context window
declares a `context_management` object of a `type` — `compaction`, `pruning` or
`injection` — and a `boundary` — `replace`, `append` or `truncate`. The package
declares that convention as the `org.js.tra.atif` extension, so a run that
transforms its context produces the event among the parts of its own trajectory
rather than in a field of the ATIF document.

```ts
import { Stream } from "effect";
import { Extensionkit, Produce, Trajectory } from "@trajs/core";
import { contextManagement, extensions } from "@trajs/extension-atif";

const extkit = Extensionkit.toProducers(Extensionkit.make(extensions), {});

// The event is what a system part carries, and the session produces it where it
// happened.
const part = Trajectory.SystemPart(extkit).make({
  system: contextManagement({ type: "compaction", boundary: "replace" }),
});

const produced = Produce.transform({ toolkit, extkit, metadata })(Stream.make(part));
```

A reader installs `extensions` in the kit it reads the trajectory with, and the
event is read back as `ContextManagement` data rather than as the JSON it was
produced as. The event states the transformation rather than the context it left:
what a `replace` bound leaves is what the messages after it carry, and ATIF's
boundary rule is what says so.

## What a step holds

A step holds what a trajectory holds of the turn it is read from. ATIF states more
than a trajectory does, and what it states is left to whoever writes the document:

- `step_id`, the ordinal ATIF numbers steps from `1` with. The steps of a
  trajectory are emitted in order and unnumbered, because a trajectory holds no
  such number; a writer numbers them by their position.
- `timestamp`, `model_name`, `reasoning_effort`, `llm_call_count`,
  `is_copied_context`, `metrics` and `extra`. A trajectory times no part of a
  conversation, names no model per turn, and counts no tokens or cost, so there
  is nothing to read them from.
- Multimodal `message` and `content` parts, which ATIF added in v1.6. An image or
  a file is referenced by a path that sits beside the trajectory file, while a
  trajectory holds the bytes themselves and no path, so the parts a step cannot
  state are not stated.
- `observation.subagent_trajectory_ref`, and the `subagent_trajectories` a
  reference resolves against. A trajectory of delegated work is a trajectory of
  another session, which this package does not read as one document yet.

Two readings of a trajectory also deviate from the shape ATIF writes: an agent
step holds its tool results as `observations` rather than in the `observation`
object ATIF wraps them in, and a step's own tool calls and results are the
response parts of the trajectory rather than the `tool_calls` and
`observation.results` those parts encode to.

`Encode.encode` reads the other way, and leaves the same fields out of the trajectory
it makes: _Reading a document_ above says of each of them what becomes of it.

## Development

- Install dependencies:

```bash
vp install
```

- Run the unit tests:

```bash
vp test
```

- Build the library:

```bash
vp pack
```
