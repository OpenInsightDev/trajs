---
title: The .trajs format
description: A trajectory on disk is newline-delimited JSON with the header first.
---

The interchange form of a trajectory is plain JSONL: one JSON object per line.
`Persist` reads and writes it.

## Layout

- **Line 1 is the header.** It carries the trajectory's non-stream fields: the
  format `version`, `metadata`, the serialized `toolkit` and the `extensions`
  registry.
- **Lines 2..n are the parts**, discriminated by the existing `_tag` field.

The header is deliberately **not a part** and carries **no `_tag`** — `_tag` means
"this is a Part", so the header and the parts are syntactically impossible to
confuse.

```jsonl
{"version":1,"metadata":{},"toolkit":{},"extensions":{"dev.trajs.otel":{"version":"1.0.0","schema":{}}}}
{"_tag":"Prompt","uuid":"0192...","timestamp":"...","messages":[]}
{"_tag":"Response","uuid":"0192...","timestamp":"...","response":{}}
{"_tag":"Extension","extension":"dev.trajs.otel","version":"1.0.0","uuid":"0192...","timestamp":"...","anchor":"0192...","data":{}}
```

Part `_tag` values are `Prompt`, `Response` and `Extension`, with no collision.

## Why the header comes first

The header must come first. This is a semantic requirement, not a convention: a
streaming decoder needs an extension's schema before it can decode that
extension's data, and a tool's schemas before it can decode that tool's parts. The
registry is a non-stream field of the trajectory, exactly like `toolkit`.

## Ordering

A `.trajs` file has one total order: write order. Time order is **not** mandated
at write time, because both common OpenTelemetry production modes make enforcing it
wrong — real-time export writes a span when it _ends_, so it lands late relative to
the parts it covers, and batch export writes everything at the end. `timestamp`
remains the time truth; reconstructing time order is a view operation.

## Reading and writing

`Persist` has four entry points:

| Export                           | Works on               | Needs                |
| :------------------------------- | :--------------------- | :------------------- |
| `Persist.encode(trajectory)`     | A `Stream` of records  | An encoder           |
| `Persist.decode(extensions)`     | A `Stream` of records  | Definitions          |
| `Persist.write(trajectory)(key)` | A key on a file system | A `FileSystem` layer |
| `Persist.read(key)`              | A key on a file system | A `FileSystem` layer |

`encode` and `decode` are the pure pair; `write` and `read` add a stream service over
a key.

```ts
import { Effect, Stream } from "effect";
import { Persist } from "trajs";

const records = await Effect.runPromise(Stream.runCollect(Persist.encode(trajectory)));

const program = Effect.scoped(
  Effect.gen(function* () {
    return yield* Persist.decode()(Stream.fromIterable(records));
  }),
);
```

## Tolerant decoding

The first record is peeled off the stream and read as the header; the remaining
records stay lazy and are decoded as parts. Data whose definition is missing is
read as an unconstrained part rather than failing to load, and tool parts are read
unconstrained because the toolkit starts empty: bind them to their tools with
[`Toolkit.toolkits`](../toolkits/) when the schemas are available.

Because the parts are read lazily from the same source as the header, the returned
trajectory is only valid within the scope the effect runs in. Consume it there.
