---
title: Extensions
description: Identity, versioning, anchoring and queries for data that is not part of the conversation.
---

A conversation is not the whole story. Analysis usually needs OpenTelemetry spans,
per-call token and cost metrics, retrieval scores, environment samples and judge
outputs. trajs calls that data **extension data**, and makes it a part of the
trajectory rather than an untyped side channel.

## Why not an `extra` bag

Putting untyped JSON in a per-level `extra` field, the way the Agent Trajectory
Interchange Format (ATIF) does, has four structural problems:

1. **Extensions have no identity.** Two producers writing `extra.retrieval_score`
   are indistinguishable, unvalidatable and undiscoverable.
2. **Versioning is whole-document.** One extension's breaking change forces a bump
   of the entire format version.
3. **Anchoring is positional.** Data can only hang off a step or tool call; data
   that spans the timeline — an OTel span covering several steps, a wall-clock
   series — has nowhere to go.
4. **Extensions have no queries.** They are JSON, so there is no "give me all
   spans" and no typed cross-extension analysis.

trajs answers each in the model itself. The full argument is in
[RFC 0001](https://github.com/OpenInsightDev/trajs/blob/main/rfcs/0001-extension.md).

## Define an extension

An extension is an identifier, a semantic version and a schema:

```ts
import { Schema } from "effect";
import { Extension } from "trajs";

const otel = Extension.make(
  "dev.trajs.otel",
  "1.0.0",
  Schema.Struct({ spanId: Schema.String, durationMs: Schema.Number }),
);
```

The identifier is namespaced (reverse-DNS or URI) so independent producers do not
collide. The version follows semver and is recorded alongside the data. How
permissive the schema is — including how it treats unknown fields — is decided by
the Effect Schema itself; the extension API does not police it.

## Collect definitions

Definitions are collected into an `Extensions` set, keyed by identifier, exactly
as tools are collected into a toolkit by name:

```ts
import { Extension } from "trajs";

const extensions = Extension.Extensions.make(otel);

Extension.Extensions.merge(extensions, Extension.Extensions.empty);
```

- `Extension.Extensions.empty` — no definitions.
- `Extension.Extensions.make(...definitions)` — keyed by `id`.
- `Extension.Extensions.merge(...sets)` — later definitions override earlier ones
  with the same identifier.

## The extension datum

An extension datum is a part in the stream, next to `PromptPart` and
`ResponsePart`, with `_tag: "Extension"`. Its envelope reuses the part metadata
that already exists, so nothing is redefined:

| Field                      | Meaning                                           |
| :------------------------- | :------------------------------------------------ |
| `extension`                | The definition's identifier; the discriminant.    |
| `version`                  | The version recorded with the datum.              |
| `anchor`                   | An optional foreign key to another part's `uuid`. |
| `timestamp`                | When the datum was recorded.                      |
| `data`                     | The payload, typed by the definition.             |
| `uuid`, `session`, `extra` | The shared [`PartMetadata`](../trajectory/).      |

`anchor` is what makes data float rather than merely attach: a datum may anchor to
nothing (pure timeline data), to a message ("this is about that message"), or —
through its own schema — describe a range such as a span's start and end, which
stays in the domain schema rather than in the envelope.

### Missing definitions

`AnyExtensionPart` accepts any `extension` and any `data`, and is a standalone
part class rather than `ExtensionPart(Extensions.empty)` because an empty schema
union is not valid. It is what a datum decodes to when its definition is not
installed, or when its payload no longer matches the definition. `isExtensionPart`
narrows either form to `AnyExtensionPart`.

## Query the data

Because extension data is typed and identified, it supports queries that a JSON
bag cannot:

- **`Extension.parts(trajectory)`** streams every extension datum, described or
  not.
- **`Extension.select(definition)(trajectory)`** streams the data of one
  extension, decoded with its schema.
- **`Extension.attach(definition)(trajectory)`** pairs an extension's data with
  the messages it is anchored to.

```ts
import { Effect, Stream } from "effect";
import { Extension } from "trajs";

const spans = await Effect.runPromise(Stream.runCollect(Extension.select(otel)(trajectory)));
```

A payload the definition does not describe is reported as a `TrajectoryError`,
never silently dropped or coerced.

## Serializing definitions

A trajectory header stores each definition's version and its schema converted to a
draft-07 JSON Schema document, so a consumer without the Effect Schema can still
read the shape of the data. See [The .trajs format](../guides/trajs-format/).

## Versioning

Versioning is **per extension**, not per document, and a datum records the version
it was written with. Several questions are deliberately still open: whether the
collection is keyed by `id` or `id@major`, and what a reader does when a datum's
major version differs from the installed definition. They are tracked in the
[vision and roadmap](../vision/).
