---
title: Toolkits and recorded tools
description: Serialize a toolkit, bind a recording to the tools it refers to and read tool calls with their results.
---

A recorded tool call names a tool and carries parameters. To decode it back into
the tool's own types, trajs has to know the tool — but a recording should still
load when it does not. trajs separates the two concerns: recorded data decodes
_tolerantly_ first, and you refine it by binding the tools you have.

## Serialize a toolkit

`Toolkit.encode` describes each tool with draft-07 JSON Schema documents, so a
toolkit can be stored or handed to a provider without the Effect Schemas it was
built from:

```ts
import { Toolkit } from "effect/ai";
import { Toolkit as TrajectoryToolkit } from "@trajs/core";

const encoded = TrajectoryToolkit.encode(toolkit);
// { get_weather: { id, name, description?, parameters, success, failure } }
```

`Toolkit.toDynamic` goes the other way, rebuilding a dynamic tool from the name
and parameter schema. Description and the success and failure schemas are dropped,
so the rebuilt tool advertises its parameters to a provider but accepts
unvalidated `unknown` parameters and reports `unknown` results.

## Tolerant response parts

`effect/ai/Response` types tool parts by the tool names of the toolkit they were
built from, so a recorded response that mentions any other tool would fail to
decode. trajs' `Response` views union the upstream schemas with two unconstrained
parts, `AnyToolCallPart` and `AnyToolResultPart`:

- `Response.AllPartsView(toolkit)`
- `Response.PartView(toolkit)`
- `Response.StreamPartView(toolkit)`

Unknown tools decode instead of being rejected, while tools that _are_ in the
toolkit keep their exact names, parameters and results. A part claiming a known
tool name whose payload no longer matches that tool's schema also falls back to
the unconstrained part — again, loading history does not depend on the current
tool schemas.

You can build these parts directly with `Response.anyToolCallPart` and
`Response.anyToolResultPart`, and narrow them with `isAnyToolCallPart`,
`isAnyToolResultPart` or `isAnyToolPart`.

## Bind a recording to its tools

`Toolkit.toolkits` extends a trajectory's toolkit. Every response part is
encoded with the trajectory's own toolkit and decoded again with the merged one,
so tool calls and results recorded while their tools were unknown regain their
exact names, parameters and results:

```ts
import { Toolkit as TrajectoryToolkit } from "@trajs/core";

const rebound = TrajectoryToolkit.toolkits(weather)(recorded);
```

Anything no tool matches stays unrestricted, and prompt parts and metadata are
carried over. Schema failures are reported as a `TrajectoryError`.

This is the step that follows loading: `Persist.decode` returns a trajectory with
an empty toolkit, because it reads tool parts unconstrained until you supply the
schemas.

## Read tool calls with their results

`Toolkit.toolTurns` pairs each recorded tool call with the result that answers it
and narrows both to the tool's types:

```ts
import { Effect, Stream } from "effect";
import { Toolkit as TrajectoryToolkit } from "@trajs/core";

const turns = await Effect.runPromise(Stream.runCollect(TrajectoryToolkit.toolTurns(rebound)));

for (const { call, result } of turns) {
  // call and result are narrowed to the tool they name
}
```

Calls and results are correlated by their identifier and must name the same tool.
Preliminary results report progress while a tool is running, so only the final one
completes a turn; a call whose result was never recorded stays pending and is
dropped. `Toolkit.toolTurn(call, result)` pairs a single call and result, and
returns `undefined` when the two name different tools.
