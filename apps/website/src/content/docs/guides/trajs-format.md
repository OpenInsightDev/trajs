---
title: The .trajs format
description: A recording is a header record and the records of its parts, stored in one of the formats a .trajs file has.
---

A recording is a stream of **records** in one total order, and a **storage format**
turns those records into the bytes of a file. `Persist` reads and writes the
records; `Format` holds the formats they are stored in.

## Records

- **The first record is the header.** It carries the trajectory's non-stream
  fields: the `metadata` (including its `version`, the `@trajs/core` version that
  wrote the recording), the serialized `toolkit` and the serialized `extkit`.
- **The records after it are the parts**, discriminated by the existing `_tag`
  field.

The header is deliberately **not a part** and carries **no `_tag`** — `_tag` means
"this is a Part", so the header and the parts are syntactically impossible to
confuse.

Part `_tag` values are `Prompt`, `Response`, `Session` and `Extension`, with no
collision.

The specification version is not a field of the header of its own: it is
`metadata.version`, and both it and the metadata are required. `Persist` writes
`Trajectory.version` — read from the `@trajs/core` manifest, so it cannot drift
from the release — and refuses to decode a header that does not state a version,
so a recording never leaves its vintage to be guessed.

## Why the header comes first

The header must come first. This is a semantic requirement, not a convention: a
streaming decoder needs a tool's schemas before it can decode that tool's parts.
The toolkit and the extension kit are non-stream fields of the trajectory.

## Storage formats

A file is written in one format, and says which one in its own name: `Persist`
reads the extension of the key and picks the format that ends with it.

| Format         | Extensions               | One record is     |
| :------------- | :----------------------- | :---------------- |
| `Format.jsonl` | `.trajs`, `.trajs.jsonl` | One line of JSON  |
| `Format.bson`  | `.trajs.bson`            | One BSON document |

A plain `.trajs` file is JSON lines, so it stays readable and diffable; a
`.trajs.bson` file holds the same records as BSON documents.

A key that names no format — `recording.bin` — is read and written only when the
format is passed along with it:

```ts
import { Effect } from "effect";
import { Format, Persist } from "@trajs/core";

const program = Effect.gen(function* () {
  yield* Persist.write(trajectory)("recording.bin", { format: Format.bson });

  return yield* Persist.read("recording.bin", { format: Format.bson });
});
```

`Format.resolve` answers which format a key names, and `Format` is a plain
interface, so a format of your own — CBOR, MessagePack, one that encrypts the
records — is a value you pass to `read` and `write`.

### JSON lines

Each record is one line of JSON, so the file is text and the header is its first
line.

```jsonl
{"metadata":{"version":"<trajs version>"},"toolkit":{},"extkit":{}}
{"_tag":"Prompt","uuid":"0192...","timestamp":"...","messages":[]}
{"_tag":"Response","uuid":"0192...","timestamp":"...","response":{}}
{"_tag":"Session","uuid":"0192...","timestamp":"...","session":"agent-a"}
```

### BSON documents

Each record is one BSON document, and the documents are written back to back with
nothing between them: BSON needs no separator, because every document states its
own size in its first four bytes. The header is the first document.

The file is binary, so it is neither readable nor diffable as text, and the values
it holds are BSON values rather than JSON ones. A document that was cut short — a
file truncated by a failed write — fails the read instead of being read as a
shorter recording.

## Ordering

A `.trajs` file has one total order: write order. Time order is **not** mandated
at write time, because both common OpenTelemetry production modes make enforcing it
wrong — real-time export writes a span when it _ends_, so it lands late relative to
the parts it covers, and batch export writes everything at the end. `timestamp`
remains the time truth; reconstructing time order is a view operation.

## Reading and writing

`Persist` has four entry points, and none of them is particular to a format:

| Export                           | Works on               | Needs                |
| :------------------------------- | :--------------------- | :------------------- |
| `Persist.encode(trajectory)`     | A `Stream` of records  | An encoder           |
| `Persist.decode(records)`        | A `Stream` of records  | Nothing              |
| `Persist.write(trajectory)(key)` | A key on a file system | A `FileSystem` layer |
| `Persist.read(key)`              | A key on a file system | A `FileSystem` layer |

`encode` and `decode` are the pure pair, working on records; `write` and `read`
add a file system and the format the key names.

```ts
import { Effect, Stream } from "effect";
import { Persist } from "@trajs/core";

const records = await Effect.runPromise(Stream.runCollect(Persist.encode(trajectory)));

const program = Effect.scoped(
  Effect.gen(function* () {
    return yield* Persist.decode(Stream.fromIterable(records));
  }),
);
```

## Tolerant decoding

The first record is peeled off the stream and read as the header; the remaining
records stay lazy and are decoded as parts. Tool and extension parts are read
unconstrained, because the toolkit starts empty and no extension kit is held:
bind them to their schemas with [`Toolkit.toolkits`](../toolkits/) and
`Extensionkit.extkits` when the schemas are available.

Because the parts are read lazily from the same source as the header, the returned
trajectory is only valid within the scope the effect runs in. Consume it there.
