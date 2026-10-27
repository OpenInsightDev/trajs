# core/atif

ATIF — the Agent Trajectory Interchange Format — and `@trajs/core` trajectories,
read as each other. `README.md` states what the module offers; this file records
where the mapping of the two stands.

## Mapping

Where each part of an ATIF document goes in a trajectory. ATIF is a document a
producer writes of a run; a trajectory is a stream of parts. The reading carries
every field the document states, and the writing states a trajectory as a
standard ATIF subset.

- `trajectory_id` → the id of the session the document's steps are rebuilt into,
  and the key that resolves a subagent reference to a document. Kept in
  `DocumentFields`, never surfaced as a field of its own.
- `session_id` → not read yet: it is the identity of a run rather than of a
  document, so it names no session. Several documents of one run — a parent and
  its embedded subagents, the segments of a continued run — state the same value.
  See `Next`.
- `subagent_trajectories[]` and `observation.results[].subagent_trajectory_ref[]`
  → one forked session per referenced document, forked from the part that carried
  the delegation.
- `continued_trajectory_ref` → a session forked from the one it continues.
- `is_copied_context` → consumed: a copied step is a part of the session the fork
  continues from, so it is not emitted again.
- `step.timestamp` → the `timestamp` of the prompt or response part of the step.
- `step_id`, `model_name`, `reasoning_effort`, `llm_call_count`, `metrics` and a
  step's `extra` → `StepFields`, extra data on the step's part.
- a tool call's `extra` → `CallFields`, extra data on the response part of that call,
  which a call is a part of its own.
- a result's `source_call_id` and its `extra` → `ResultFields`, extra data on the
  response part of that result.
- a recording's `duration_sec` → `MediaFields`, extra data on the part that holds its
  bytes, keyed by the ordinal of the media among the ones the part states.
- `schema_version`, `agent`, `notes`, `final_metrics` and a document's `extra` →
  `DocumentFields`, extra data on the session part.
- `agent.tool_definitions` → a real toolkit — dynamic tools over the JSON schema
  the document states — named in the trajectory header. What a definition states
  besides the tool — its `type`, its `strict` and its `extra` — is the
  `agent.tool_definitions` of `DocumentFields`, by the name each tool is called by.
- an image or audio `ContentPart` (a path) → the bytes read through the file system
  the reading runs on, embedded as a `file` part of the message or of the result that
  states it. A path is read under the directory the reading is given — the one a
  document read from a file lies in — and as it is stated where it is absolute or no
  directory is given.
- a `system` step with a `message` → the prompt of a turn; one that declares
  `context_management` or carries only an `observation` → an Event, read back as a
  `system` step.

Contract: ATIF → trajs is lossless; trajs → ATIF is lossless into a standard ATIF
subset (ATIF's cross-file features omitted). No information is lost, but the
concrete ATIF form may differ. `session_id` is the field the reading goes past
while it is unread, so the contract holds of it only once `Next` is done.

## Status

- Done: `PromptPart.timestamp` in core (with the `parts` builders and the produce
  session's `enqueuePrompt`/`enqueueResponse`); the format typed in `Document.ts`
  (`Metrics`, `FinalMetrics`, `ToolDefinition`, `SubagentTrajectoryRef`,
  `SchemaVersion`, `ProducerFields`, recursive `subagent_trajectories`); the extra
  data declared in `Extra.ts` (`StepFields`, `DocumentFields`, `CallFields`,
  `ResultFields`, `MediaFields`); the context management convention declared as an
  event in `Event.ts`.
- Done: the kits the reading is made with — `Encode.encode` names this module's
  `extrakit` and `eventkit` in the config of the trajectory it produces, so a reader
  installs the same two kits and reads back what a document states.
- Done: the reading as it stands — `Encode.encode` produces the steps of a
  document as the turns of a trajectory, and `Step.steps` reads a trajectory back
  as the steps it was read from. A step that states a message opens a turn with
  it; an agent step is produced as the response of the turn before it, or opens a
  turn of its own with no message where that turn was answered already. What is
  read of a document is the conversation its steps hold, the media a step states
  the bytes of — read through the file system the reading runs on, under the
  directory it is given — and what the document states around that conversation:
  the tools an agent was given, as the toolkit of the trajectory, which
  `internal/toolkit.ts` builds of them; the fields of a step (`StepFields`), of a
  call (`CallFields`), of a result (`ResultFields`) and of the media a part holds
  (`MediaFields`), each on the part of that step, call, result or media, with the
  moment a step happened timed on the part of that step; and the fields of the run
  (`DocumentFields`) on the session part. Everything else a document states is
  left at the door — the identity of its run, the trajectory of a delegated or
  continued run, whether a step repeats an earlier one, what a system step is
  answered with, and the context management a system step declares, which
  `Document.ts` does not state either, so the reading cannot see it. `Encode.encode`
  states of each of those fields what becomes of it, and the two mapping sections of
  the README state the same from the side of a document and of a step.
- Done: the reading of a file as well as of a document — `Encode.fromFile` reads the
  `trajectory.json` a path names, decodes it as the document it holds and reads
  that, with the directory the file lies in, so the media a document states is read
  beside it. The effect it returns is run before the trajectory is made, since the
  tools a document states its agent was given are the toolkit the trajectory is read
  with.
- Next: the reading of `session_id`, the identity of the run a document belongs to.
  It is run-scoped, so it cannot name a session and cannot resolve a reference: the
  session is named by `trajectory_id`, which a document embedded in another has to
  set, and `session_id` stays out of the reading until this item says what a run is
  in a trajectory. The decision is between keeping it as what the session states of
  the run it came from — an extra beside `DocumentFields`, so documents read one at
  a time can still be told apart as the same run — and consuming it while the
  mapping says that reading them separately leaves no trace that they belong
  together. Either way it never names a session, and `Step.ts` reads it back only
  where it is kept.
- Next: the reading of what a document states beyond its conversation — sessions and
  forks, and the split of system steps into messages and events. Then `Step.ts` reads
  those fields back, and the two mapping sections of the README are rewritten as each
  of them is read.

## Checks

- `vp check` in `packages/core`.
- No tests cover this. Do not add tests unless asked.
