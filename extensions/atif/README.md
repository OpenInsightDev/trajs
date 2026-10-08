# @trajs/extension-atif

ATIF system steps as a [trajs](https://github.com/OpenInsightDev/trajs) extension.

The Agent Trajectory Interchange Format records a `source: "system"` step for
operations the system initiates rather than the user or the model: context
compaction, pruning, knowledge injection, subagent delegation, environment
resets and checkpoints. The conversation parts of a trajectory have no place for
one, so this package models it as extension data.

```ts
import { Effect, Stream } from "effect";
import { Prompt, Toolkit } from "effect/ai";
import { Extension, Trajectory } from "@trajs/core";
import { Atif } from "@trajs/extension-atif";

const prompt = Trajectory.promptPart(Prompt.make("Context compaction performed"));

const trajectory = Trajectory.make(
  Stream.make(
    prompt,
    Atif.part(
      {
        operation: "context-management",
        contextManagement: { type: "compaction", boundary: "replace" },
        observation: { results: [{ content: "Summary: prior conversation..." }] },
      },
      { anchor: prompt.uuid },
    ),
  ),
  Toolkit.empty,
  {},
  Atif.extensions,
);

const steps = await Effect.runPromise(
  Stream.runCollect(Extension.select(Atif.extension)(trajectory)),
);
```

## Models and the specification

Each exported model is annotated with the ATIF version whose shape it mirrors,
so the mapping from this package to the specification is machine-readable:

```ts
import { Schema } from "effect";
import { Atif } from "@trajs/extension-atif";

Schema.resolveAnnotations(Atif.SystemStep)?.atifVersion; // => [1, 7]
```

| Model               | ATIF version | Added for                                                        |
| :------------------ | :----------- | :--------------------------------------------------------------- |
| `SystemStep`        | v1.7         | System steps since v1.2; `context_management` since v1.7.        |
| `ContextManagement` | v1.7         | The `context_management` convention.                             |
| `SubagentRef`       | v1.7         | Resolvable subagent refs; delegation on system steps since v1.2. |
| `Observation`       | v1.2         | Observations of system-initiated operations.                     |
| `ObservationResult` | v1.2         | A single result of such an observation.                          |

## Loading ATIF

`Load` will turn a parsed ATIF document, such as Harbor's `agent/trajectory.json`,
into a trajectory. The module is a stub today: the mapping is blocked on an ATIF
step being turn-grained while a trajs part is message-grained, and `Load.trajectory`
fails as a defect until that is settled.

```ts
import { Effect } from "effect";
import { Load } from "@trajs/extension-atif";

const document = JSON.parse(await readFile("agent/trajectory.json", "utf8"));

// Not implemented: fails with a defect.
const trajectory = await Effect.runPromise(Load.trajectory(document));
```

## Multi-agent coverage

[Multi-agent coverage](./multi-agent-coverage.md) assesses whether a recording can
carry everything ATIF records about a multi-agent run: what the session model
covers, which references it cannot express, and what an ATIF round trip loses.
