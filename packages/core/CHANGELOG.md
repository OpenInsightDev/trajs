# @trajs/core

## 0.0.0-alpha.2

### Minor Changes

- [`6c8f6cb`](https://github.com/trajs-ai/trajs/commit/6c8f6cb6aa7f65dd70f8fdeb09bfb103ec82c679) Thanks [@observerw](https://github.com/observerw)! - `View.metricTrajectory` reads its trajectory into `Cache.Cache` and hands every part the
  reports that name it, keyed by metric tag, rather than a stream per part. A part's
  `metrics` is now a `View.AttachedMetrics` record from a metric's tag to that metric's
  reports of the part, in trajectory order, so one metric's reports are read as
  `part.metrics[tag]` and their payloads narrow to that metric. A report may name a part
  that appears after it, and a part is consumed once with all of its reports.
  
  The function takes a `Trajectory` rather than a bare stream, because the cache reads it
  by id, returns an `Effect` of the view rather than the view, and requires `Cache.Cache`.
  Reading a trajectory now completes before the first part is emitted, so an infinite
  trajectory never emits.
  
  `Config.SchemaServices` states the requirement of an operation that both reads and
  writes parts: the union of `DecodingServices` and `EncodingServices`, where it was their
  intersection and dropped a side that was `never`. `Session.main` and
  `View.metricTrajectory` require it.

### Patch Changes

- Updated dependencies []:
  - @trajs/utils@0.0.0-alpha.2

## 0.0.0-alpha.1

### Patch Changes

- [`eb0faec`](https://github.com/trajs-ai/trajs/commit/eb0faec9944c344eabe9e32f19a7507b821e53ad) Thanks [@observerw](https://github.com/observerw)! - Release the core libraries under `packages/` as `0.0.0-alpha.1`. They are one
  Changesets `fixed` group and share that version: `@trajs/core`, `@trajs/olap`,
  `@trajs/platform-browser`, `@trajs/platform-bun`, `@trajs/platform-node` and
  `@trajs/utils`.
- Updated dependencies [[`eb0faec`](https://github.com/trajs-ai/trajs/commit/eb0faec9944c344eabe9e32f19a7507b821e53ad)]:
  - @trajs/utils@0.0.0-alpha.1
