---
title: API reference
description: The modules and exports of the trajs core package.
---

The `@trajs/core` package re-exports every module as a namespace. Each is also
available as a subpath import, such as `@trajs/core/Response`.

| Module            | Subpath                       | Purpose                                                                                                                                                                                                                             |
| :---------------- | :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Codec`           | `@trajs/core/Codec`           | Request exports: `ChatCompletionMessage`, `ChatCompletionSessions` and `makeChatCompletion` for chat completions; `AnthropicMessage`, `AnthropicConversation`, `AnthropicSessions` and `makeMessages` for Anthropic's Messages API. |
| `Trajectory`      | `@trajs/core/Trajectory`      | The part model: `Metadata`, `PartMetadata`, `PromptPart`, `ResponsePart`, the part unions, `make` and `mapMetadata`.                                                                                                                |
| `View`            | `@trajs/core/View`            | Reading a trajectory as a conversation: `PromptTurn`, `promptTurns`, `prompt`.                                                                                                                                                      |
| `Response`        | `@trajs/core/Response`        | Tolerant response parts: `AllPartsView`, `PartView`, `StreamPartView`, `AnyToolCallPart`, `AnyToolResultPart` and their guards and constructors. Re-exports `effect/ai/Response`.                                                   |
| `Toolkit`         | `@trajs/core/Toolkit`         | Toolkit serialization and rebinding: `encode`, `toDynamic`, `toolkits`, `toolTurn`, `toolTurns`.                                                                                                                                    |
| `Format`          | `@trajs/core/Format`          | The storage formats of a `.trajs` file: the `Format` interface, `jsonl`, `bson` and `resolve`.                                                                                                                                      |
| `Persist`         | `@trajs/core/Persist`         | The `.trajs` codec: `encode`, `decode`, `write`, `read`. Neither is particular to a storage format; `read` and `write` take the one the key names, or the one passed with `FormatOptions`.                                          |
| `TrajectoryError` | `@trajs/core/TrajectoryError` | Typed failures: `TrajectoryError` and its reasons `ToolEncodeError`, `ToolDecodeError`, `ExtensionEncodeError`, `ExtensionDecodeError`, `ParseError`.                                                                               |

## Conventions

The package is ESM only. Public modules are top-level, PascalCase files, one file
per namespace, imported as namespaces (`import * as Trajectory from "@trajs/core/Trajectory"`).
Anything under `@trajs/core/internal/*` is private and is not part of the public API.

Every public module and export carries an Effect-style JSDoc block with a
description and, where useful, `**When to use**`, `**Details**` and `**Example**`
sections, so the API reads the same way as `effect/ai`.

## Related

- [Trajectories](../concepts/trajectory/)
- [Toolkits and recorded tools](../guides/toolkits/)
- [The .trajs format](../guides/trajs-format/)
