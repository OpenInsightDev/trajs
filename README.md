# trajs

**Record, version and analyze AI model sessions as trajectories.**

[![Deploy docs](https://github.com/OpenInsightDev/trajs/actions/workflows/deploy.yml/badge.svg)](https://github.com/OpenInsightDev/trajs/actions/workflows/deploy.yml)
[![Docs](https://img.shields.io/badge/docs-tra.js.org-6d5efc.svg)](https://tra.js.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![status: pre-release](https://img.shields.io/badge/status-pre--release-orange.svg)](#status)

A session with an AI model is recorded for evaluation, debugging and analysis.
trajs records the conversation a model ran on — the messages it was given and the
parts it returned — as a trajectory that stays attached to the toolkit and
metadata it was recorded with, so it can be stored, replayed and inspected.

A trajectory is a **stream of parts** — the messages sent to a model, the
responses it returned, and the session declarations that mark where a session
starts and what it continues from — sharing one total order. trajs is built on
[Effect](https://effect.website) and reuses the vocabulary of `effect/ai`: a
`Trajectory` is a `Stream`, and tools are `Tool`s collected into a `Toolkit`.

trajs targets the same problem as [ATIF](https://github.com/harbor-framework/harbor/blob/main/rfcs/0001-trajectory-format.md),
the Agent Trajectory Interchange Format, and aims to be a strict superset. Where
ATIF models a run as a document, trajs models it as a stream of parts that stays
attached to the context it was recorded in.

## Highlights

- **A trajectory is a stream, not a document.** Prompt parts, response parts and
  session declarations share one total order, so a consumer that only knows about
  messages cannot silently drop the rest.
- **Toolkits round-trip.** A toolkit serializes to draft-07 JSON Schema, and a
  recording made against an empty or older toolkit is decoded again against the
  tools it actually refers to, regaining their exact names, parameters and results.
- **Tolerant by design.** Tools outside the toolkit decode to unconstrained parts
  instead of failing, so loading recorded history never depends on the tools
  installed today.
- **Sessions derive.** A session records where it continues from, so forks,
  resumes and sub-agents can be reconstructed from the recording.
- **Tool calls come with their results.** `Toolkit.toolTurns` correlates each
  recorded tool call with the result that answers it, narrowed to the tool's types.
- **One interchange format, two storages.** A `.trajs` file is a header record
  and one record per part; `Format.jsonl` writes them as lines of JSON and
  `Format.bson` as BSON documents.

## Install

> [!IMPORTANT]
> trajs is pre-release: the packages are not on npm yet and the API can still
> change. The package will be installed with:
>
> ```bash
> pnpm add @trajs/core effect
> ```

Until then, work in this repository and import the package from the workspace.

## Quick start

Record a prompt and encode the trajectory as a `.trajs` file:

```ts
import { Effect, Stream } from "effect";
import { Prompt } from "effect/ai";
import { Persist, Trajectory } from "@trajs/core";

const trajectory = Trajectory.make(
  Stream.make(Trajectory.promptPart(Prompt.make("Hello"))),
  Trajectory.Metadata.make({ name: "greeting" }),
);

const records = await Effect.runPromise(Stream.runCollect(Persist.encode(trajectory)));
```

Load a recording with `Persist.decode`, `Persist.read` or `Persist.encode`.

## The .trajs format

A recording is a stream of records. The first is a header carrying the `metadata`
(including its `version`, the `@trajs/core` version that wrote the recording) and
the serialized `toolkit` and `extkit`; every record after it is a part,
discriminated by `_tag`. The header carries no `_tag` — `_tag` means "this is a
part" — so the two are impossible to confuse.

`Format` holds the storage formats the records are written in, and a file says
which one it is in its own name:

| Format         | Extensions               | One record is     |
| :------------- | :----------------------- | :---------------- |
| `Format.jsonl` | `.trajs`, `.trajs.jsonl` | One line of JSON  |
| `Format.bson`  | `.trajs.bson`            | One BSON document |

```jsonl
{"metadata":{"version":"<trajs version>"},"toolkit":{},"extkit":{}}
{"_tag":"Prompt","uuid":"0192...","timestamp":"...","messages":[]}
{"_tag":"Response","uuid":"0192...","timestamp":"...","response":{}}
```

## Documentation

The full documentation lives at **[tra.js.org](https://tra.js.org/)**:

- [Getting started](https://tra.js.org/getting-started/)
- [Trajectories](https://tra.js.org/concepts/trajectory/)
- [Toolkits and recorded tools](https://tra.js.org/guides/toolkits/)
- [The .trajs format](https://tra.js.org/guides/trajs-format/)
- [Vision and roadmap](https://tra.js.org/vision/)
- [API reference](https://tra.js.org/reference/core/)

The site is built with Astro Starlight from `apps/website/src/content/docs` and
published by `.github/workflows/deploy.yml`.

## Repository layout

| Path             | Description                                                                                  |
| :--------------- | :------------------------------------------------------------------------------------------- |
| `packages/core`  | The `@trajs/core` library: trajectories, responses, toolkits and the `.trajs` codec.         |
| `apps/website`   | The Astro Starlight documentation site.                                                      |
| `rfcs`           | Design records, including [RFC 0002: Sessions and Session Derivation](rfcs/0002-session.md). |
| `packages/utils` | Placeholder package from the monorepo scaffold.                                              |

Each public module of `packages/core` is a namespace and a subpath import, such as
`@trajs/core/Trajectory` or `@trajs/core/Persist`; everything under `@trajs/core/internal/*` is
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
vp run website    # docs dev server
vp run dev        # alias for vp run website
```

## Status

trajs is an early, pre-release project. The library lives in `packages/core`, and
the remaining design questions — including ATIF interoperability — are tracked in
the [vision and roadmap](https://tra.js.org/vision/).

## License

[MIT](LICENSE).
