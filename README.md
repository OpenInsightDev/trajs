# trajs

**Record, version and analyze AI model sessions as trajectories.**

[![Deploy docs](https://github.com/OpenInsightDev/trajs/actions/workflows/deploy.yml/badge.svg)](https://github.com/OpenInsightDev/trajs/actions/workflows/deploy.yml)
[![Docs](https://img.shields.io/badge/docs-openinsightdev.github.io-6d5efc.svg)](https://openinsightdev.github.io/trajs/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![status: pre-release](https://img.shields.io/badge/status-pre--release-orange.svg)](#status)

A session with an AI model is recorded for evaluation, debugging and analysis, but
the conversation alone is rarely enough: you also want the OpenTelemetry spans,
the per-call token and cost metrics, the retrieval scores and the judge outputs.
trajs gives that data a home next to the conversation.

A trajectory is a **stream of parts** — the messages sent to a model, the
responses it returned, and **extension** data such as spans and metrics — that
stays attached to the toolkit, metadata and extension definitions it was recorded
with. trajs is built on [Effect](https://effect.website) and reuses the vocabulary
of `effect/ai`: a `Trajectory` is a `Stream`, tools are `Tool`s collected into a
`Toolkit`, and extensions mirror that shape with `Extension` and `Extensions`.

trajs targets the same problem as [ATIF](https://github.com/harbor-framework/harbor/blob/main/rfcs/0001-trajectory-format.md),
the Agent Trajectory Interchange Format, and aims to be a strict superset. Where
ATIF scatters untyped `extra: {}` bags across the document, trajs makes extension
data a first-class part with an identity, a version, a schema and an anchor.

## Highlights

- **A trajectory is a stream, not a document.** Prompt parts, response parts and
  extension parts share one total order, so extension data cannot be dropped by a
  combinator that only knows about messages.
- **Extensions are first-class.** An extension is a namespaced identifier, a
  semantic version and a schema, collected into an `Extensions` set like tools in
  a toolkit; each datum carries its version and an optional anchor to the part it
  is about.
- **Tolerant by design.** Tools outside the toolkit and extensions without an
  installed definition decode to unconstrained parts instead of failing, so
  loading recorded history never depends on the definitions installed today.
- **Toolkits round-trip.** A toolkit serializes to draft-07 JSON Schema, and a
  recording made against an empty or older toolkit is decoded again against the
  tools it actually refers to, regaining their exact names, parameters and results.
- **Tool calls come with their results.** `Toolkit.toolTurns` correlates each
  recorded tool call with the result that answers it, narrowed to the tool's types.
- **One interchange format.** A `.trajs` file is newline-delimited JSON with the
  header first, so definitions always precede the data they describe.

## Install

> [!IMPORTANT]
> trajs is pre-release: the packages are not on npm yet and the API can still
> change. The package will be installed with:
>
> ```bash
> pnpm add trajs effect
> ```

Until then, work in this repository and import the package from the workspace.

## Quick start

Record a prompt, attach an extension datum and encode the trajectory as a `.trajs`
file:

```ts
import { Effect, Schema, Stream } from "effect";
import { Prompt, Toolkit } from "effect/ai";
import { Extension, Persist, Trajectory } from "trajs";

const otel = Extension.make(
  "dev.trajs.otel",
  "1.0.0",
  Schema.Struct({ spanId: Schema.String, durationMs: Schema.Number }),
);

const trajectory = Trajectory.make(
  Stream.make(
    Trajectory.promptPart(Prompt.make("Hello")),
    Trajectory.anyExtensionPart({
      extension: "dev.trajs.otel",
      data: { spanId: "s1", durationMs: 42 },
    }),
  ),
  Toolkit.empty,
  { name: "greeting" },
  Extension.Extensions.make(otel),
);

const records = await Effect.runPromise(Stream.runCollect(Persist.encode(trajectory)));
```

Read the data back with `Extension.select` and `Extension.attach`, and load a
recording with `Persist.decode`, `Persist.read` or `Persist.encode`.

## The .trajs format

A recording is plain JSONL: line 1 is a header carrying the format `version`, the
`metadata`, the serialized `toolkit` and the `extensions` registry; every later
line is a part, discriminated by `_tag`. The header carries no `_tag` — `_tag`
means "this is a part" — so the two are impossible to confuse.

```jsonl
{"version":1,"metadata":{},"toolkit":{},"extensions":{"dev.trajs.otel":{"version":"1.0.0","schema":{}}}}
{"_tag":"Prompt","uuid":"0192...","timestamp":"...","messages":[]}
{"_tag":"Extension","extension":"dev.trajs.otel","version":"1.0.0","uuid":"0192...","timestamp":"...","anchor":"0192...","data":{}}
```

## Documentation

The full documentation lives at **[openinsightdev.github.io/trajs](https://openinsightdev.github.io/trajs/)**
(a `tra.js.org` domain is pending approval):

- [Getting started](https://openinsightdev.github.io/trajs/getting-started/)
- [Trajectories](https://openinsightdev.github.io/trajs/concepts/trajectory/) and
  [Extensions](https://openinsightdev.github.io/trajs/concepts/extensions/)
- [Toolkits and recorded tools](https://openinsightdev.github.io/trajs/guides/toolkits/)
- [The .trajs format](https://openinsightdev.github.io/trajs/guides/trajs-format/)
- [Vision and roadmap](https://openinsightdev.github.io/trajs/vision/)
- [API reference](https://openinsightdev.github.io/trajs/reference/core/)

The site is built with Astro Starlight from `apps/website/src/content/docs` and
published by `.github/workflows/deploy.yml`.

## Repository layout

| Path             | Description                                                                                 |
| :--------------- | :------------------------------------------------------------------------------------------ |
| `packages/core`  | The `trajs` library: trajectories, responses, toolkits, extensions and the `.trajs` codec.  |
| `apps/website`   | The Astro Starlight documentation site.                                                     |
| `rfcs`           | Design records, including [RFC 0001: Extension API for Trajectory](rfcs/0001-extension.md). |
| `extensions`     | Reserved for extension packages.                                                            |
| `packages/utils` | Placeholder package from the monorepo scaffold.                                             |

Each public module of `packages/core` is a namespace and a subpath import, such as
`trajs/Trajectory` or `trajs/Persist`; everything under `trajs/internal/*` is
private.

## Development

Requires Node.js `>=22.18.0`. The repository uses [Vite+](https://viteplus.dev)
(`vp`) with pnpm; run `vp install` once after cloning.

```bash
vp install        # install dependencies
vp check          # format, lint and type-check
vp run -r test    # run the test suites
vp run -r build   # build every package and the docs site
vp run ready      # check + tests + builds, the aggregate gate
vp run dev        # docs dev server (vp run website#dev)
```

## Status

trajs is an early, pre-release project. The library lives in `packages/core`, the
format is versioned per extension rather than per file, and the remaining design
questions — including ATIF interoperability — are tracked in
[RFC 0001](rfcs/0001-extension.md) and the
[vision and roadmap](https://openinsightdev.github.io/trajs/vision/).

## License

[MIT](LICENSE).
