# RFC 0001: Extension API for Trajectory

| Field  | Value      |
| :----- | :--------- |
| Status | Accepted   |
| Date   | April 2026 |

## I. Motivation

A trajectory today records a conversation: `PromptPart` (messages sent to a
model) and `ResponsePart` (parts a model returned). Trajectory analysis needs
more than the conversation: OTel spans, per-call token/cost metrics, retrieval
scores, environment samples, judge outputs. These are **extension data**.

This design targets the same problem as
[ATIF](https://github.com/harbor-framework/harbor/blob/main/rfcs/0001-trajectory-format.md),
the Agent Trajectory Interchange Format, and aims to be a strict superset.

ATIF's extensibility is a set of untyped `extra: {}` JSON bags scattered across
root, agent, step, tool call, observation result, metrics and subagent ref. This
has four structural problems:

1. **Extensions have no identity.** Two producers writing `extra.retrieval_score`
   are indistinguishable, unvalidatable and undiscoverable.
2. **Versioning is whole-document.** `schema_version: "ATIF-v1.x"` couples every
   extension's evolution to the core format. ATIF v1.7 made a _breaking_ change
   to a localized concept (subagent refs) and had to bump the entire document
   version.
3. **Anchoring is positional.** Data can only hang off a step / tool call /
   observation result. Data that spans or floats across the timeline (an OTel
   span covering several steps, a wall-clock series) has nowhere to go.
4. **Extensions have no queries.** They are JSON, so there is no "give me all
   spans", and no typed cross-extension analysis.

Harbor also has to update the core schema whenever a formerly-extension field is
promoted (v1.5 `tool_definitions`, v1.7 `llm_call_count`), which is another
breaking document change.

## II. Model

An extension datum is a first-class entry in the trajectory stream, not a
side-channel. The core vocabulary is unchanged: **a trajectory is a stream of
parts**, and an extension datum is one kind of part.

```
Trajectory = Stream<Part> + { toolkit, metadata, extensions }
Part       = PromptPart | ResponsePart(toolkit) | ExtensionPart(extensions)
```

Two consequences:

- **`Part` stays closed at the schema level; `ExtensionPart` is a new union
  member, not a change to existing parts.** Consumers that pattern-match parts
  gain one arm, which the compiler forces them to make explicit. Extension data
  can never be silently dropped by a combinator that only knows about prompts
  and responses.
- **Definitions are not parts.** The registry of extension definitions is a
  non-stream field of the trajectory, exactly like `toolkit`. This matters for
  the wire format: a decoder must know an extension's schema before it can decode
  the extension's data, so definitions must precede data.

## III. Definitions and collection

The API mirrors `effect/ai`'s `Tool` / `Toolkit` exactly; no new vocabulary is
introduced.

| Toolkit pattern                                     | Extension pattern                     |
| :-------------------------------------------------- | :------------------------------------ |
| `Tool.make(name, { parameters, success, failure })` | `Extension.make(id, version, schema)` |
| `Tool.Any`                                          | `Extension.Any`                       |
| `Toolkit` (a set of tools)                          | `Extensions` (a set of extensions)    |
| `Toolkit.make(...tools)`                            | `Extensions.make(...definitions)`     |
| `Toolkit.empty`                                     | `Extensions.empty`                    |
| `Toolkit.merge(...toolkits)`                        | `Extensions.merge(...extensions)`     |
| `ResponsePart(toolkit)`                             | `ExtensionPart(extensions)`           |
| `AnyResponsePart = ResponsePart(Toolkit.empty)`     | `AnyExtensionPart`                    |
| `Part(toolkit)`                                     | `Part(toolkit, extensions)`           |

Read through the `Extension` module namespace, a definition is
`Extension.make(...)` and the collection is `Extension.Extensions.make(...)`, by
the same convention that makes `Trajectory.make(...)` and
`Trajectory.Trajectory<T>` available today. `AnyExtensionPart` is a standalone
part class rather than `ExtensionPart(Extensions.empty)`, because an empty
`Schema.Union` is not a valid schema.

A definition is keyed by `id` in the collection, exactly as a tool is keyed by
name in a toolkit. The `id` is expected to be namespaced (reverse-DNS or URI),
for example `dev.trajs.otel`.

```ts
// Extension.ts — plays the role Toolkit.ts plays today
export interface Extension<out Id extends string, out Data, out Encoded> {
  readonly [ExtensionTypeId]: ExtensionTypeId
  readonly id: Id
  readonly version: string                 // semver
  readonly schema: Schema.Codec<Data, Encoded>
}

export const make = <const Id extends string, Data, Encoded>(
  id: Id,
  version: string,
  schema: Schema.Codec<Data, Encoded>,
): Extension<Id, Data, Encoded> => ...
```

`version` is a semver string recording the definition's version. How strictly a
reader enforces it is described in Open Questions.

## IV. `ExtensionPart`

`ExtensionPart` is defined in `Trajectory.ts`, next to `ResponsePart`. It reuses
the part metadata that already exists, so the envelope is not redefined.

```ts
// Trajectory.ts
const ExtensionPartOf = <Id extends string, Data, Encoded>(
  definition: Extension.Extension<Id, Data, Encoded>,
) =>
  Schema.TaggedClass()("Extension", {
    extension: Schema.Literal(definition.id), // discriminant, like a tool's name
    version: Schema.optional(Schema.String),
    anchor: Schema.optional(Uuid),
    timestamp: Timestamp,
    data: definition.schema,
    ...PartMetadata.fields, // uuid, session, extra
  });
```

- `uuid` is the datum's own identity (a UUID v7 by default), so data can be
  referenced and de-duplicated when streams are merged.
- `anchor` is an optional foreign key to another part's `uuid`: it means "this
  datum is about that message". A datum may anchor to nothing (pure timeline
  data) or, via its own schema, describe a range (a span's start/end stay in the
  domain schema, not in the envelope).
- `data` is the domain payload, typed by the definition.

The collection-driven schema mirrors `Response.PartView`, including the opaque
fallback: an unregistered extension, or a datum whose payload no longer matches
its definition, decodes to `AnyExtensionPart` rather than failing to load. This
reuses the same principle as `Response.AnyToolCallPart` / `AnyToolResultPart`:
loading recorded history must not depend on the currently installed definitions.

```ts
export const ExtensionPart = (extensions: Extensions) =>
  Schema.Union([
    ...Object.values(extensions).map(ExtensionPartOf),
    AnyExtensionPart, // unconstrained; `data: Schema.Json`
  ]);
```

How permissive a definition is (for example whether unknown payload fields are
dropped or rejected) is decided by the Effect Schema the definition is built
from; the extension API does not police it.

## V. `.trajs` interchange format

The interchange form is plain JSONL: one JSON object per line.

- **Line 1 is the header.** It carries the trajectory's non-stream fields: the
  format `version`, `metadata`, `toolkit` and the `extensions` registry. It is
  deliberately **not** a part and carries **no `_tag`** — `_tag` means "this is a
  Part". This makes the header and the parts syntactically impossible to
  confuse.
- **Lines 2..n are parts**, discriminated by the existing `_tag` field. Part
  `_tag` values are `Prompt`, `Response` and `Extension`, with no collision.
- The header must come first. This is a semantic requirement, not a convention:
  a streaming decoder needs an extension's schema before it can decode that
  extension's data.

```jsonl
{"version":1,"metadata":{},"toolkit":{},"extensions":{"dev.trajs.otel":{"version":"1.0.0","schema":{}}}}
{"_tag":"Prompt","uuid":"0192...","timestamp":"...","messages":[]}
{"_tag":"Response","uuid":"0192...","timestamp":"...","response":{}}
{"_tag":"Extension","extension":"dev.trajs.otel","version":"1.0.0","uuid":"0192...","timestamp":"...","anchor":"0192...","data":{}}
```

**Ordering.** A `.trajs` file has one total order: write order. Time order is
not mandated at write time, because both common OTel production modes make
enforcing it wrong — real-time export writes a span when it _ends_ (so it lands
late relative to the parts it covers), and batch export writes everything at the
end. `timestamp` remains the time truth; reconstructing time order is a view
operation.

## VI. Module layout

`ExtensionPart` lives in `Trajectory.ts`, next to `ResponsePart`, and refers to
the `Extension` and `Extensions` types with a type-only import. That import is
erased at runtime, so `Extension.ts` still sits above `Trajectory.ts` (just as
`Toolkit.ts` does today) without a runtime cycle, and no parallel definition
type is needed.

- `Trajectory.ts`: `ExtensionPart` (typed factory + `AnyExtensionPart`),
  `anyExtensionPart`, `isExtensionPart`, wired into `Part`, `AnyPart` and the
  stream types. `Trajectory` gains an `extensions` field and `make` gains an
  `extensions` parameter.
- `Extension.ts`: `Extension`, `Extensions`, `encode`, and the analysis
  combinators `parts`, `select`, `byAnchor`.
- `TrajectoryError.ts`: extension and parse failures alongside the toolkit ones.
- `Persist.ts`: the `.trajs` codec, `encode` and `decode`.
- `index.ts`: re-export `Extension`.

## VII. Alternatives considered

- **Untyped `extra` bags (the ATIF approach).** Free-form JSON at every level has
  no identity, version or validation, and anchors data to structural positions
  only. Rejected in Section I.
- **A parallel extension stream, kept apart from the parts stream.** Cleaner for
  typing, but the interchange format is a single JSONL log, so the two streams
  would have to be partitioned and re-interleaved on every read. Merging at the
  part level keeps one explicit order instead.
- **A dedicated definition type mirroring `id`, `version` and `schema`.** This
  would avoid `Trajectory.ts` referencing `Extension.ts`, but duplicates types
  that already exist. A type-only import is erased at runtime, so no runtime
  cycle appears, and the real `Extension` and `Extensions` types are used.
- **Storing extension data in a part's existing `extra` field.** Loses the
  uniform envelope, the anchor, and the per-extension schema.

## VIII. Open questions

These are recorded, not yet decided.

1. **Registry key.** Key the collection by `id` (one definition per id, the
   latest), or by `id@major` (multiple incompatible majors coexist, so data
   written years ago still decodes)? `id` is the consistent choice given the
   Toolkit mirror; `id@major` favours long-term dataset decodability.
2. **Semver enforcement.** `version` is recorded, but what a reader does when its
   definition's major differs from the data's is undecided, as is whether minor
   differences are tolerated.
3. **ATIF interoperability.** Exporting a trajectory (plus extensions) to ATIF
   JSON, and loading ATIF back, is a goal and is the clearest demonstration that
   this model is a superset. It is blocked on a real modelling gap: an ATIF
   `step` is turn-grained (LLM call + tool calls + observation) while a `Part` is
   message-grained (`PromptPart` plus several `ResponsePart`s). The mapping is
   undecided.
4. **Mid-stream registry growth.** Allowing the header to recur and merge, so a
   long-running producer can append definitions as it goes. Deferred.

## IX. Non-goals

- No whole-trajectory `schema_version`. Versioning is per extension.
- No `extra`-style untyped escape hatch in the extension envelope; a definition's
  own Effect Schema decides how permissive it is.
- No new stream element type: extension data is a `Part`.
