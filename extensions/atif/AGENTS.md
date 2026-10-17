# extensions/atif

ATIF — the Agent Trajectory Interchange Format — and `@trajs/core` trajectories,
read as each other. `README.md` states what the package offers; this file records
where the mapping of the two stands.

## Mapping

Where each part of an ATIF document goes in a trajectory. ATIF is a document a
producer writes of a run; a trajectory is a stream of parts. The reading carries
every field the document states, and the writing states a trajectory as a
standard ATIF subset.

- `session_id` → the id of the trajs session; the steps of the document are
  rebuilt into it.
- `trajectory_id` → consumed as the key that resolves a subagent reference to a
  document. Kept in `DocumentFields`, never surfaced as a field of its own.
- `subagent_trajectories[]` and `observation.results[].subagent_trajectory_ref[]`
  → one forked session per referenced document, forked from the part that carried
  the delegation.
- `continued_trajectory_ref` → a session forked from the one it continues.
- `is_copied_context` → consumed: a copied step is a part of the session the fork
  continues from, so it is not emitted again.
- `step.timestamp` → the `timestamp` of the prompt or response part of the step.
- `step_id`, `model_name`, `reasoning_effort`, `llm_call_count`, `metrics` and a
  step's `extra` → `StepFields`, extra data on the step's part.
- `schema_version`, `agent`, `notes`, `final_metrics` and a document's `extra` →
  `DocumentFields`, extra data on the session part.
- `agent.tool_definitions` → a real toolkit — dynamic tools over the JSON schema
  the document states — named in the trajectory header.
- an image or audio `ContentPart` (a path) → the bytes read from disk relative to
  the directory of the ATIF file, embedded as a `file` part.
- a `system` step with a `message` → the prompt of a turn; one that declares
  `context_management` or carries only an `observation` → an Event, read back as a
  `system` step.

Contract: ATIF → trajs is lossless; trajs → ATIF is lossless into a standard ATIF
subset (ATIF's cross-file features omitted). No information is lost, but the
concrete ATIF form may differ.

## Status

- Done: `PromptPart.timestamp` in core (with `responsePart` and the produce
  session's `enqueuePrompt`/`enqueueResponse`); the format typed in `Document.ts`
  (`Metrics`, `FinalMetrics`, `ToolDefinition`, `SubagentTrajectoryRef`,
  `SchemaVersion`, `ProducerFields`, recursive `subagent_trajectories`); the extra
  data declared in `Extras.ts`.
- Next: the reading (`Encode.ts`, `internal/reading.ts`) — an effectful `encode`
  with an IO seam `read(path) => Effect<Uint8Array, E>`, sessions and forks, media,
  the toolkit, the extra data, and the split of system steps into messages and
  events. Then `Step.ts` reads those fields back, and the two mapping sections of
  the README are rewritten.

## Checks

- `vp check` in `packages/core` and `extensions/atif`.
- No tests cover this: `extensions/atif` has no test file and the repository has
  one (`extensions/tokenize/tests/Metric.test.ts`). Do not add tests unless asked.
