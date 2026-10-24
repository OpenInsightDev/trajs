# Case: compaction

## What it shows

A run read as the steps it happened in: every prompt, every run of responses, and every event,
in the order the session produced them. The harness compacts the agent's context between two
turns, so the run falls into the phases either side of the event, and the file the agent had
read before the compaction is read again after it. The compaction is the `ContextManagement`
event of `@trajs/extension-atif`, the convention ATIF states a transformed context as.

Reading a session as steps rather than as turns keeps what a turn does not hold. The event
stands in the same list as the prompts and responses, so one pass over the stream says what
happened before it and what happened after it. The phase boundary is the event itself rather
than a moment the analysis would have to join a separate reading on.

## When you need it

- Auditing a run that compacts, prunes, or injects into its context, where what the agent knew
  before and after the transformation is the question.
- Reporting what a run cost in repeated work: a file, a search, or a page read again because
  the context that held it was dropped.
- Building a timeline of a session that states events beside its conversation: an incident
  review, a viewer that marks each step, or a scorer that weighs a phase.
