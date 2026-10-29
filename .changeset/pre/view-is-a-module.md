---
"@trajs/core": minor
---

`View` is a module of `@trajs/core` rather than one file: `packages/core/src/View.ts`
becomes `packages/core/src/view`, imported as `@trajs/core/view`, with the views
reachable beside the barrel as `@trajs/core/view/StepView`,
`@trajs/core/view/ToolView` and `@trajs/core/view/MetricView`, and what the metric
view reads of a cached trajectory under `@trajs/core/view/internal`, which is not
exported.

The names a caller uses do not change: `steps`, `prompt`, `toolCalls`, `toolTurns`,
`metricOutputs` and `metricTrajectory` are the exports of that barrel, and `@trajs/core`
re-exports the module as `View`. Only the subpath a module file is imported by moves,
from `@trajs/core/View` to `@trajs/core/view`.
