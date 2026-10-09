---
title: Getting started
description: Record a trajectory and read it back.
---

A trajectory is a stream of parts plus the toolkit and metadata it was recorded
with. This guide records one and encodes the result to the `.trajs` interchange
format.

## Install

```bash
pnpm add @trajs/core effect
```

trajs reuses `effect` and `effect/ai`, so a project already using them only needs
the `@trajs/core` package.

## Record a trajectory

A prompt part records the messages a model was given, and a response part records
what it returned. `Trajectory.make` attaches the toolkit and metadata to the
stream.

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
      return yield* Persist.decode(Stream.fromIterable(records));
    }),
  ),
);
```

`Persist.read` and `Persist.write` do the same against a key on a
`FileSystem.FileSystem`; provide a platform layer for your runtime when you use
them. See [The .trajs format](../guides/trajs-format/) for the record layout.

## Next steps

- [Trajectories](../concepts/trajectory/) explains the part model in full.
- [Toolkits and recorded tools](../guides/toolkits/) covers binding a recording to
  the tools it refers to.
