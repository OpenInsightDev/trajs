---
title: Getting started
description: Record a trajectory, attach extension data and read it back.
---

A trajectory is a stream of parts plus the toolkit, metadata and extension
definitions it was recorded with. This guide records one, adds an extension datum
and encodes the result to the `.trajs` interchange format.

## Install

```bash
pnpm add @trajs/core effect
```

trajs reuses `effect` and `effect/ai`, so a project already using them only needs
the `@trajs/core` package.

## Record a trajectory

A prompt part records the messages a model was given, and a response part records
what it returned. `Trajectory.make` attaches the toolkit, metadata and extensions
to the stream.

```ts
import { Stream } from "effect";
import { Prompt, Toolkit } from "effect/ai";
import { Trajectory } from "@trajs/core";

const trajectory = Trajectory.make(
  Stream.make(Trajectory.promptPart(Prompt.make("Hello"))),
  Toolkit.empty,
  Trajectory.Metadata.make({ name: "greeting" }),
);
```

`Trajectory.Metadata.make` builds the metadata, and `version` defaults to
`Trajectory.version` when it is omitted.

Every part carries a `uuid` (a UUID v7, so identifiers sort by creation time), an
optional `session` and an optional `extra` field. Those come from `PartMetadata`,
which is spread into every part class.

## Define an extension

An extension describes a kind of data that is not part of the conversation. It has
a namespaced identifier, a version and a schema for its payload.

```ts
import { Schema } from "effect";
import { Extension } from "@trajs/core";

const otel = Extension.make(
  "dev.trajs.otel",
  "1.0.0",
  Schema.Struct({ spanId: Schema.String, durationMs: Schema.Number }),
);
```

Collect definitions with `Extension.Extensions.make`, then record data as
`ExtensionPart`s with `anyExtensionPart` (or the typed factory for a collection).
An optional `anchor` points at the `uuid` of the part the datum is about.

```ts
import { Stream } from "effect";
import { Toolkit } from "effect/ai";
import { Extension, Trajectory } from "@trajs/core";

const extensions = Extension.Extensions.make(otel);

const recorded = Trajectory.make(
  Stream.make(
    Trajectory.anyExtensionPart({
      extension: "dev.trajs.otel",
      anchor: "<uuid of the message this span covers>",
      data: { spanId: "s1", durationMs: 42 },
    }),
  ),
  Toolkit.empty,
  Trajectory.Metadata.make({}),
  extensions,
);
```

## Read the data back

`Extension.select` streams the data of one extension, typed by its definition.
`Extension.attach` pairs the data of an extension with the messages it is anchored
to. Both skip parts of other extensions and report a payload the definition does
not describe as a typed error.

```ts
import { Effect, Stream } from "effect";
import { Extension, Trajectory } from "@trajs/core";

const spans = await Effect.runPromise(Stream.runCollect(Extension.select(otel)(recorded)));

Array.from(spans, (span) => span.spanId); // => ["s1"]
```

## Store it

`Persist.encode` turns a trajectory into the records of a `.trajs` file, header
first, and `Persist.decode` reads them back. Both work on `Stream`s and need no
file system:

```ts
import { Effect, Stream } from "effect";
import { Persist } from "@trajs/core";

const records = await Effect.runPromise(Stream.runCollect(Persist.encode(trajectory)));

const restored = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      return yield* Persist.decode()(Stream.fromIterable(records));
    }),
  ),
);
```

`Persist.read` and `Persist.write` do the same against a key on a
`FileSystem.FileSystem`; provide a platform layer for your runtime when you use
them. See [The .trajs format](../guides/trajs-format/) for the record layout.

## Next steps

- [Trajectories](../concepts/trajectory/) explains the part model in full.
- [Extensions](../concepts/extensions/) covers identity, versioning and anchoring.
- [Toolkits and recorded tools](../guides/toolkits/) covers binding a recording to
  the tools it refers to.
