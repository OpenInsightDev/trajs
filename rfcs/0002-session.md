<!-- markdownlint-disable MD013 -->

# RFC 0002: Sessions and Session Derivation

| Field  | Value      |
| :----- | :--------- |
| Status | Proposed   |
| Date   | April 2026 |

## I. Motivation

A trajectory is already a stream of parts that may carry an optional `session`
string, so a **multi-agent recording** is expressible today: several sessions
are interleaved in one stream and each part says which one it belongs to. What
that model cannot express is a **derivation**: a session that begins from a
point in an existing session. In practice this covers several of the same
shape — a fork, a resumed session, a sub-agent spawned by a parent, or a
context that was compacted into a continuation.

Two things are worth separating before proposing a mechanism.

1. **A `PromptPart` records the prompt, not the assembled context.** It stores
   the messages passed as the prompt; the full context a model received (system
   messages, prior turns the runtime prepends) is not necessarily part of it. A
   derived session therefore does not itself contain its inherited context, so the
   edge is not a label over duplicated content — it is the only record that the
   context came from somewhere.
2. **The relation is not recoverable by inspection.** A derived session may
   inherit a subset of its parent, or a summary produced by compaction, so message
   equality is not a reliable signal, and even when it is, diffing message lists is
   expensive and lossy. The relation is genuinely new information.

An explicit edge is what lets analysis reconstruct what a derived session
inherited, attribute tokens and cost without double-counting shared context,
draw the agent tree, and answer provenance questions ("where did this session's
context come from?").

## II. Model

The core vocabulary is unchanged: **a trajectory is a stream of parts**, and a
session derivation is one kind of part.

```
Trajectory = Stream<Part> + { toolkit, metadata, extensions }
Part       = PromptPart | ResponsePart(toolkit) | ExtensionPart(extensions) | SessionPart
```

Two rules keep the design minimal:

- **Interleaving is unchanged.** Every part keeps its optional `session`
  string. A part remains self-describing, so interleaved sessions need no
  ordering or adjacency assumptions. This RFC adds no session attribute to the
  envelope.
- **The edge carries only the lineage.** The trajectory records prompts and
  responses; it does not record the assembled context a model received. A
  `SessionPart` therefore carries no messages — it states which session it starts
  and which part of another session it continues from. The inherited context
  itself stays in the parent's own parts, where it was recorded.

`Part` grows one union member, exactly as RFC 0001 added `ExtensionPart`. At the
schema level the union stays closed, so a consumer that pattern-matches parts is
forced by the compiler to handle sessions explicitly, and a derived session can
never be silently mistaken for an unrelated one.

## III. `SessionPart`

`SessionPart` is defined in `Trajectory.ts`, next to `ResponsePart` and
`ExtensionPart`, and reuses the part envelope.

```ts
// Trajectory.ts
class SessionPart extends Schema.TaggedClass<SessionPart>()("Session", {
  /** The session this part declares. Required, unlike `PartMetadata.session`. */
  session: Schema.String,
  /** The part of another session this one continues from. */
  fork: Schema.optional(Uuid),
  timestamp: Timestamp,
  ...PartMetadata.fields, // uuid, session, extra
}) {}
```

- The declaring part's own `session` is the new session. A `SessionPart` with
  no `fork` is a plain session declaration: it starts a session with no
  inherited context.
- `fork` is the `uuid` of the part the new session continues from, in _another_
  session. **The parent session is not stored.** It is that part's `session`,
  read off the referenced part, so storing it here would only repeat something
  the part already carries.
- The child inherits the parent session's context **up to and including** the
  `fork` part. Pointing `fork` at the parent's `SessionPart` inherits nothing
  conversational, which expresses a sub-agent spawned without inherited turns;
  pointing it at the parent's latest part inherits the whole conversation to
  date. There is no "as of now" default, because naming the part is both
  explicit and knowable to a streaming writer — it is the part the writer just
  wrote.
- **Invariant.** The `SessionPart` that declares a session precedes that
  session's other parts in the stream, because a streaming writer emits it when
  the session starts. Like the header coming first, this is a semantic
  requirement of the format, not something the schema enforces.
- **Agent metadata is extension data.** A name, role, model or label belongs to
  the agent, not to the derivation edge, so it is an `ExtensionPart` whose
  `anchor` is this part's `uuid`. The anchor mechanism already exists; sessions
  reuse it rather than growing the core envelope.

## IV. Reading sessions

A `Session` module reads sessions out of a trajectory. Because each session has
at most one `fork`, the graph is a forest and the operations are small:

- `Session.parts(trajectory)` — the `SessionPart` declarations of a trajectory.
- `Session.select(id)` — the parts recorded under a session, its own timeline
  without what it inherited.
- `Session.parent(id)` — the parent edge: look up the `fork` part, read its
  `session`. Emitted at most once.
- `Session.of(id)` — streams a session: the parent's parts up to the `fork`
  part, followed by the session's own parts, recursively.
- `Session.children(id)` — the reverse view, computed from the edges; the
  format stores one direction only.

Every read is a stream. `parent`, `children` and `of` share one scan that keeps
the session of each part by its identifier, because a `fork` names the part it
continues from. `parent` and `of` stop consuming at the session's declaration;
`children` consumes the whole recording, because a child can be declared
anywhere, and `of` holds only the parts up to the declaration.

`of` holds parts while the stream is consumed and releases them once the
session's declaration is reached, where the inherited parts are resolved from
what was held and the rest of the session is emitted as it arrives. Only the
parts up to the declaration are held, so reading a session near the start of a
long recording does not materialize the whole of it. The one pass over the held
parts is the lineage walk, not a plain filter: parts of interleaved sessions are
dropped, and each ancestor's parts are cut at _its_ fork point, not the child's.

Consistent with how response and extension parts degrade, a `fork` that names a
part absent from the loaded recording is a **dangling edge**, not a load
failure: partial or filtered reads stay readable, and an analysis that walks the
lineage reports the break. A cycle is invalid and is reported rather than
followed. A well-formed recording cannot contain one: each `fork` target
precedes its declaration, so following the edges only ever moves backwards.

## V. Wire format

One new `_tag`, no header change, no change to `Persist`.

```jsonl
{"_tag":"Session","uuid":"0192...","timestamp":"...","session":"agent-b"}
{"_tag":"Session","uuid":"0192...","timestamp":"...","session":"agent-c","fork":"0192..."}
```

The header still carries the non-stream fields. A derivation is not one of
them: the header is written before the parts and never rewritten, while a fork
happens mid-recording, so a fork cannot be known when the header is written.
Parts are the append-only timeline, and a derivation is a timeline event.

## VI. Module layout

The split mirrors the extension module, which separates the part from the
operations on it.

- `Trajectory.ts`: `SessionPart`, `isSessionPart`, wired into `Part`,
  `PartEncoded` and `AnyPart`. `SessionPart` needs no toolkit- or
  extension-parameterised variant, because nothing about it is toolkit-dependent.
- `Session.ts`: the public API — `parts`, `select`, `parent`, `of`, `children`.
  The file exists and is empty today; it gets its public API here. `parts` and
  `select` are filters; the rest delegate to the internal module.
- `internal/session.ts`: the lineage walk and the streaming reducer for `of`,
  plus `parent` and `children`. It is not exported from the package, so the
  recursive resolution stays off the public surface.
- `index.ts`: re-export `Session`, alongside the other namespaces.

## VII. Alternatives considered

- **A `sessions` field in the header or in `Metadata`.** Central, but the header
  is written first and never rewritten, so a fork that occurs during a recording
  cannot be added to it. It also puts session identity in a second place while
  parts already carry `session`.
- **A session-definition `ExtensionPart`.** Sessions are core (the `session`
  string is already core), and a fork recorded as an extension would vanish for
  any reader that does not install the definition — losing the very edge that
  makes the recording interpretable. Extension data is domain payload, not
  structure.
- **A `fork` field on `PartMetadata`.** A derivation is a session-level fact, so
  carrying it on every part repeats it, and "the first part of the session" is a
  positional convention that breaks when the stream is filtered or reordered.
  `PartMetadata` is also spread into every extension part.
- **A structured `session` (an object that embeds its parent on each part).**
  Same redundancy, and it changes the meaning of a field that already works.
- **A compound `parent: { session, at }` edge with an optional point.** Storing
  `session` repeats what the referenced part already carries, and making the
  point optional forces an "as of now" default that only stream order can define.
  A single `fork: Uuid` says the same thing, derives the session from the part,
  and has no default to get wrong.
- **Storing parent and child edges.** The child-to-parent direction is enough;
  the reverse is a derived view, so storing both would be redundant.

## VIII. Open questions

These are recorded, not yet decided.

1. **Field naming.** `fork` assumes divergence, but the same edge also covers a
   resume or a sub-agent spawn. `continuesFrom` or `derivedFrom` are more neutral.
   The part `_tag` is `Session` either way.
2. **Multiple parents.** Merge or synthesis (several sessions feeding one) needs
   an array. A single parent is the decision for now — it covers fork, resume and
   sub-agent spawn, and keeps the graph a forest — with the array left as a later
   schema upgrade.
3. **Several `Session` parts for one session.** This RFC reads the first
   declaration as the session's identity and its `fork` as the one parent edge. A
   later `Session` part naming an existing session could instead mean a resumed
   or compacted continuation; that is not modelled yet.
4. **Core session metadata.** Whether a name or role deserves to be in the core
   `SessionPart` rather than an anchored extension.
5. **Enforcement.** Whether a writer validates acyclicity and ordering, or the
   format leaves it to combinator-time checks.
6. **`fork` boundary.** Inclusive versus exclusive is fixed here as inclusive;
   confirm that matches how inherited context is actually assembled.
7. **ATIF interoperability.** Mapping to and from ATIF's subagent reference, and
   whether ATIF's turn-grain `step` mapping (RFC 0001, Open Question 3) changes
   the intended meaning of the `fork` point.

## IX. Non-goals

- **No session registry.** Sessions are not declared in the header and are not a
  non-stream field; they are discovered from `SessionPart`s and the `session`
  strings on parts.
- **No content duplication.** The edge never restates the context a session
  inherited; that context remains in the parent's own parts.
- **No new stream element type.** A session derivation is a `Part`.
