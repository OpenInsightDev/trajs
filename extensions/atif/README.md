# @trajs/extension-atif

A recording in the terms of [ATIF](https://docs.harborframework.com/agents/atif),
the Agent Trajectory Interchange Format Harbor records agents with.

ATIF carries a run as one ordered list of steps — a system prompt, a user
message, or a complete agent turn — and Harbor writes it to `trajectory.json`,
which its results viewer reads and its agents load. `Step.steps` derives that
list from a `@trajs/core` recording, so a recording can be read as the steps the
format exchanges, and the extension of _Context management events_ below records
what ATIF states of a run of its own. The document around them — the agent that
ran, the numbering of the steps, the metrics, the JSON that is written — is what
this package is for and does not provide yet; _What a step holds_ below says
where the rest of the gap is.

## Usage

```ts
import { Effect, Stream } from "effect";
import { Step } from "@trajs/extension-atif";

const steps = await Effect.runPromise(Stream.runCollect(Step.steps(recording)));

// One step per message a model was given, one for the turn that answered them.
steps.map((step) => step.source); // => ["user", "agent"]
```

`Step.steps` reads the turns of `View.promptTurns` of `@trajs/core`, so a step is
derived from a turn rather than from the parts a recording arrived in: the
increments of a streamed response are folded into the parts they complete, and a
response part that no prompt precedes belongs to no turn and is dropped. As in
`View.promptTurns`, a recording that interleaves several sessions is read one
session at a time.

## Context management events

ATIF records what happens of a run, rather than what is said, as system steps,
and states what some of them do as a convention of its own. The one ATIF v1.8
defines is context management: a step that transforms the agent's context window
declares a `context_management` object of a `type` — `compaction`, `pruning` or
`injection` — and a `boundary` — `replace`, `append` or `truncate`. The package
declares that convention as the `org.js.tra.atif` extension, so a run that
transforms its context records the event among the parts of its own trajectory
rather than in a field of the ATIF document.

```ts
import { Stream } from "effect";
import { Extensionkit, Produce, Trajectory } from "@trajs/core";
import { contextManagement, extensions } from "@trajs/extension-atif";

const extkit = Extensionkit.toProducers(Extensionkit.make(extensions), {});

// The event is what a system part carries, and the session records it where it
// happened.
const part = Trajectory.SystemPart(extkit).make({
  system: contextManagement({ type: "compaction", boundary: "replace" }),
});

const recorded = Produce.transform({ toolkit, extkit, metadata })(Stream.make(part));
```

A reader installs `extensions` in the kit it reads the recording with, and the
event is read back as `ContextManagement` data rather than as the JSON it was
recorded as. The event states the transformation rather than the context it left:
what a `replace` bound leaves is what the messages after it carry, and ATIF's
boundary rule is what says so.

## What a step holds

A step holds what a recording holds of the turn it is read from. ATIF states more
than a recording does, and what it states is left to whoever writes the document:

- `step_id`, the ordinal ATIF numbers steps from `1` with. The steps of a
  recording are emitted in order and unnumbered, because a recording holds no
  such number; a writer numbers them by their position.
- `timestamp`, `model_name`, `reasoning_effort`, `llm_call_count`,
  `is_copied_context`, `metrics` and `extra`. A recording times no part of a
  conversation, names no model per turn, and counts no tokens or cost, so there
  is nothing to read them from.
- Multimodal `message` and `content` parts, which ATIF added in v1.6. An image or
  a file is referenced by a path that sits beside the trajectory file, while a
  recording holds the bytes themselves and no path, so the parts a step cannot
  state are not stated.
- `observation.subagent_trajectory_ref`, and the `subagent_trajectories` a
  reference resolves against. A recording of delegated work is a recording of
  another session, which this package does not read as one document yet.

Two readings of a recording also deviate from the shape ATIF writes: an agent
step holds its tool results as `observations` rather than in the `observation`
object ATIF wraps them in, and a step's own tool calls and results are the
response parts of the recording rather than the `tool_calls` and
`observation.results` those parts encode to.

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
