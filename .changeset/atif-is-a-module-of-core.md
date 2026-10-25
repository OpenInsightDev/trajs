---
"@trajs/core": minor
---

ATIF is a module of `@trajs/core`: `@trajs/extension-atif` moves to
`packages/core/src/atif` and is imported as `@trajs/core/atif`, with each module
reachable beside the barrel as the modules of a package are —
`@trajs/core/atif/Document`, `Encode`, `Event`, `Extra` and `Step` — and its
private logic under `@trajs/core/atif/internal`, which is not exported. The
barrel names each module as a namespace, as `effect/eventlog` does, so what the
module states is read as `Document.*`, `Encode.*`, `Event.*`, `Extra.*` and
`Step.*`. The package root does not re-export it, as `effect` does not re-export
`effect/cluster`. The `@trajs/extension-atif` package is removed, so a program
that reads ATIF depends on `@trajs/core` alone.

The extra and event declarations are read from their namespace:
`Extra.documentExtra`, `Extra.stepExtra`, `Event.contextManagement` and
`Event.eventkit` were `documentExtra`, `stepExtra`, `contextManagement` and
`eventkit`.

What the module declares is namespaced by the package it ships in: the document
and step extra data and the context management event are tagged
`@trajs/core/Document`, `@trajs/core/Step` and `@trajs/core/ContextManagement`
rather than under the extension, so a trajectory the extension wrote reads
without them. What they carry is unchanged.
