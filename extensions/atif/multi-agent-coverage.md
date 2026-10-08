# Covering ATIF's multi-agent model

Whether a recording can carry everything ATIF records about a multi-agent run,
and where it cannot. Written against ATIF-v1.7/v1.8 and the session model of
[RFC 0002](../../rfcs/0002-session.md).

## Verdict

**Not a full cover.** Within one recording, in the right order, and where a
delegation is understood as an inheritance, the session model expresses ATIF's
multi-agent structure, and improves on it in places. Three classes of gap remain,
and an ATIF → trajs → ATIF round trip loses information:

1. **Reference versus derivation.** ATIF's `SubagentTrajectoryRef` is a
   reference: it claims no inheritance, may point outside the document, and may
   be many-to-one. A `SessionPart`'s `fork` is a derivation edge: it claims
   inheritance, must name a part of the same recording, and gives every session
   at most one parent.
2. **Missing structure.** No document-level identity (`trajectory_id`), no
   cross-file reference, and one toolkit and extension registry for the whole
   recording rather than one per agent.
3. **Order and invariants.** A `fork` target must precede its declaration,
   because the reads are streaming and only look backwards, while ATIF resolves a
   reference by identifier and is order-free. Concatenated or reordered
   recordings silently lose edges.

## The two models

| Aspect                  | ATIF                                                                                                                                        | trajs                                                                                                                                                     |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carrier                 | A document tree: a parent document with embedded `subagent_trajectories` or `trajectory_path` references to external files.                 | One flat JSONL stream in which sessions are interleaved by the `session` string on each part.                                                             |
| Relation                | A reference resolved by `trajectory_id` or `trajectory_path`, claiming no inheritance.                                                      | A derivation edge: `SessionPart.fork` names a part of the same stream and means "continues from that part", inherited context included.                   |
| Identity                | A document-level `trajectory_id`, unique within its array, plus a run-level `session_id` that siblings and continuations may share or omit. | The `uuid` of each part, plus the `session` string each part carries.                                                                                     |
| Resolution              | By identifier against an array, order-free, and may stay unresolved.                                                                        | Streaming and backwards-only: `Session.parent` and `Session.of` do not drain the rest of the recording, so a target that has not been read yet is lost.   |
| Topology                | A DAG: one `trajectory_id` may be referenced from several observation results, and one `trajectory_path` from several documents.            | A forest: one `fork` per session, so one parent (RFC 0002, open question 2).                                                                              |
| Per-agent configuration | Each subagent document carries its own `agent` (name, version, `model_name`, `tool_definitions`) and its own step sequence.                 | One header per trajectory: `toolkit`, `extensions` and `metadata` are attached to the whole stream, and agent identity has to be anchored extension data. |

## Feature by feature

| ATIF                                                               | trajs                                                              | Verdict                                                                                      |
| :----------------------------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| A parent produces a subagent that starts from a point in it        | `SessionPart.fork`                                                 | Covered, but see gap 1                                                                       |
| The subagents of a session                                         | `Session.children`                                                 | Covered, but see gap 3                                                                       |
| The full history of a subagent                                     | Interleaved in one stream, selected by `session`                   | Covered, and cheaper: no document copy and no identifier uniqueness to maintain              |
| Embedded subagents, recursively                                    | Sessions and forks in the flat stream                              | Content covered; the document boundary and per-document agent configuration are lost (gap 6) |
| `ref.trajectory_id`, resolved in this document                     | `fork` naming the child's declaring part                           | Expressible, but it forces the inheritance semantics of gap 1                                |
| `ref.trajectory_path`, an external file, URL or database reference | Nothing                                                            | Not covered (gap 2)                                                                          |
| `ref.session_id`, informational, shared by siblings                | No equivalent                                                      | Not covered, and trajs is the stricter model (gap 4)                                         |
| Several references under one observation result                    | Several `SessionPart`s                                             | Partial: "these belong to one delegation" has no structured expression                       |
| `trajectory_id`, document-level and unique                         | `Metadata.id`, which carries no uniqueness or resolution semantics | Not covered (gap 4)                                                                          |
| `continued_trajectory_ref`, a continuation in another file         | A `fork` within one file, at best                                  | Not covered across files (gap 7)                                                             |
| A DAG: one subagent referenced from several places                 | A forest                                                           | Not covered (gap 5)                                                                          |
| A subagent reference on a system step                              | `Atif.SystemStep.observation.subagentTrajectoryRef`                | Partial: a reference on an agent step's observation result has no definition yet             |

## What is covered

- **Parent and child, with inherited context.** `fork` names a part of the parent
  session and `Session.of` reconstructs the context inherited up to that point.
  ATIF has no such notion: a subagent document starts at `step_id` 1 and carries
  its own complete history.
- **Interleaving with one total order.** Sessions share a single stream, while
  ATIF's embedded documents are separate timelines.
- **Token and cost attribution.** RFC 0002 §I makes the edge the only record that
  a context came from somewhere, which is what allows shared context not to be
  counted twice. ATIF cannot express this.
- **Cycle detection.** A cycle is reported as `TrajectoryError` rather than
  followed; ATIF defines no such check.

## Gaps

### 1. A reference is not a derivation

RFC 0002 §II makes the edge semantic — it is _the only record that the context
came from somewhere_ — and `SessionPart` documents `fork` as the part of another
session the new one _continues from_. Expressing an ATIF reference as a `fork`
therefore asserts something ATIF never states about a subagent. Both choices lose
something:

- **A `fork` edge** puts the relation in the core session tree, but calls a
  reference an inheritance, and an export to ATIF has no field for the inherited
  context it implies.
- **An extension datum** (such as `Atif.SubagentRef`) keeps the semantics, but
  `Session.parent` and `Session.children` cannot see it: the relation leaves the
  core session tree and is only reachable through extension queries.

There is a precision loss either way. ATIF attaches the reference to one
`ObservationResult`, optionally tied to a tool call by `source_call_id`; a `fork`
can only say "inherited up to a part", not "this subagent was produced _by that
tool call_". `Atif.SubagentRef` currently exists only inside `SystemStep`, so
the delegation an agent step's tool call performs has no home at all.

### 2. An external reference cannot be expressed

`fork` names a part uuid, and a trajectory stored elsewhere has none. A `fork`
that names a part the recording does not have is deliberately _silent_:
`inheritedOf` returns no inherited parts and `edges` emits no edge, which
`tests/session.test.ts` pins. The information does not become an error; it
disappears.

The workaround is to declare a session that has no parts in this recording. It is
lossy twice: without a `fork` it does not appear in `Session.children` at all, and
with one it re-asserts the inheritance of gap 1. There is no placeholder saying
"a trajectory out there is named X".

### 3. Resolution is order-sensitive

The lineage reads only look backwards:

- `inheritedOf` resolves the `fork` target within the parts it is given, and
  `Session.of` passes only the parts it has held so far.
- `edges` keeps an incremental map of part uuid to session and can only emit an
  edge when it reaches a declaration, so a target that appears later is never
  seen.
- The tests state the precondition outright: _each edge's target precedes its
  declaration, so both are resolvable_.

Concatenating a parent recording with its subagent recordings — the natural way
to build one file for a multi-agent run — therefore loses parents and inherited
context, silently, whenever a child is declared before the parent's parts. ATIF
resolves references by identifier against an array and does not care about order.

This is not a local bug. Reading backwards-only is deliberate: the tests pin that
neither `Session.parent` nor `Session.of` drains the rest of the recording, which
is what makes them usable on a long or unbounded stream. Order-free lineage needs
a linking pass instead.

### 4. Document identity and run identity have no equivalent

`Metadata` carries an optional `id`, `name` and `description` and nothing else: no
uniqueness, no resolution. ATIF needs `trajectory_id` to be unique within an array
because it is the key a reference resolves against, and it defines `session_id` as
run-scoped, explicitly shared by a parent, its subagents and its continuations.

The trajs `session` string is a _session_ identity: siblings must differ, or
`Session.parent` and `Session.of` treat them as one session, of which only the
first `SessionPart` is the declaration. trajs is the stricter model, but it cannot
represent "several subagents sharing one run identity" directly — loading has to
assign each sibling its own session and keep the run identity elsewhere.

### 5. A DAG is a forest here

The specification requires `trajectory_id` to be unique among the entries of one
array, but nothing forbids two references resolving to the same entry. A reference
graph is therefore a DAG, and one subagent may be referenced from several
observation results, or from several documents through `trajectory_path`. trajs
allows one `fork` per session, which RFC 0002 records as open question 2.

### 6. Per-agent tools, extensions and document boundaries

A trajectory's header holds one `toolkit`, one `extensions` registry and one
`metadata`, and `Trajectory` attaches all three to the whole stream. Merging
several agents into one recording therefore merges their toolkits and their
definition registries, and "which agent could use which tools" stops being
structurally visible. ATIF keeps `agent.tool_definitions` per document.

Agent identity has no defined home yet either. RFC 0002 §III places it on an
extension anchored to a `SessionPart`, but only the ATIF system step is defined
so far; a name, version or model for each subagent is not.

Extension data is the exception that works: an extension part carries the
`session` of its `PartMetadata`, so per-session metrics, spans and scores are
expressible today.

### 7. Resuming and continuing

RFC 0002, open question 3: only the first `SessionPart` of a session is read, so a
session that is resumed or continued after a compaction cannot be expressed. ATIF
represents it as a new `trajectory_id` with `continued_trajectory_ref`, and marks
carried-over steps with `is_copied_context`.

## Round trips

**ATIF → trajs** loses `trajectory_path`, a shared run identity, document
boundaries with their per-document toolkit and agent, the DAG, and
`continued_trajectory_ref`. It must also invent `fork` edges, turning references
into inherited context, or demote the references to extension data and give up the
core session tree.

**trajs → ATIF** has nowhere to put the inherited context a `fork` implies, must
split an interleaved stream into a parent document plus subagent documents and
mint a `trajectory_id` for each, must place every reference inside an observation
result (possibly inventing a delegation step), and must derive
`is_copied_context` from which parts a session inherited.

`Load.trajectory` is still a stub, so all of this is a design assessment rather
than observed behaviour.

## What to add

In order:

1. **Separate reference from derivation.** Keep `fork` for inheritance, and give
   a cross-trajectory reference its own defined datum carrying `trajectoryId`,
   `trajectoryPath` and a run identity, anchored to the part that performs the
   delegation. `Atif.SubagentRef` covers a system step only; an agent step's tool
   call needs the same treatment.
2. **Give documents and sessions a resolvable identity.** Promote `Metadata.id` to
   a document identity that is unique and can be referenced, and carry a run
   identity plus per-agent configuration as an extension anchored to a
   `SessionPart`.
3. **Decouple lineage from order.** A linking pass, or a `Session` read that
   drains, is needed before a concatenated or reordered recording keeps its
   edges; otherwise an ATIF import loses them silently.
4. **Allow a reference to a trajectory outside the recording.** A dangling `fork`
   is silent today, so an external key needs an explicit placeholder if the
   relation is to stay in the session tree.
5. **Multiple parents.** RFC 0002, open question 2. It can wait, but ATIF does
   allow one subagent to be referenced from several places.

## Scope

This is an analysis, produced without a test run: the observations about ordering,
dangling forks and cycles are read off the implementation and its tests, not
executed. The order sensitivity of gap 3 has no test of its own yet — the suite
covers a dangling fork and a cycle, but not a `fork` whose target appears later in
the stream.
