---
title: API reference
description: The modules and exports of the trajs core package.
---

The `trajs` package re-exports every module as a namespace. Each is also
available as a subpath import, such as `trajs/Response`.

| Module            | Subpath                 | Purpose                                                                                                                                                                           |
| :---------------- | :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Trajectory`      | `trajs/Trajectory`      | The part model: `Metadata`, `PartMetadata`, `PromptPart`, `ResponsePart`, `ExtensionPart`, the part unions and `make`.                                                            |
| `Response`        | `trajs/Response`        | Tolerant response parts: `AllPartsView`, `PartView`, `StreamPartView`, `AnyToolCallPart`, `AnyToolResultPart` and their guards and constructors. Re-exports `effect/ai/Response`. |
| `Toolkit`         | `trajs/Toolkit`         | Toolkit serialization and rebinding: `encode`, `toDynamic`, `toolkits`, `toolTurn`, `toolTurns`.                                                                                  |
| `Extension`       | `trajs/Extension`       | Extension definitions and queries: `Extension`, `Extensions`, `make`, `encode`, `parts`, `select`, `attach`.                                                                      |
| `Persist`         | `trajs/Persist`         | The `.trajs` codec: `encode`, `decode`, `write`, `read`.                                                                                                                          |
| `TrajectoryError` | `trajs/TrajectoryError` | Typed failures: `TrajectoryError` and its reasons `EncodeError`, `DecodeError`, `ExtensionEncodeError`, `ExtensionDecodeError`, `ParseError`.                                     |

## Conventions

The package is ESM only. Public modules are top-level, PascalCase files, one file
per namespace, imported as namespaces (`import * as Trajectory from "trajs/Trajectory"`).
Anything under `trajs/internal/*` is private and is not part of the public API.

Every public module and export carries an Effect-style JSDoc block with a
description and, where useful, `**When to use**`, `**Details**` and `**Example**`
sections, so the API reads the same way as `effect/ai`.

## Related

- [Trajectories](../concepts/trajectory/)
- [Extensions](../concepts/extensions/)
- [Toolkits and recorded tools](../guides/toolkits/)
- [The .trajs format](../guides/trajs-format/)
- [RFC 0001: Extension API for Trajectory](https://github.com/OpenInsightDev/trajs/blob/main/rfcs/0001-extension.md)
