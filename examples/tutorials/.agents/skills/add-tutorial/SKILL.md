---
name: add-tutorial
description: Use when adding, rewriting, or reviewing a tutorial in `examples/tutorials`. Covers the packages it is written against, `main.test.ts`, the README lesson, the list in `README.md`, and the checks.
---

# Add a tutorial

One API per directory, on the shortest trajectory it is visible on.
A whole run read for what it asks is a case in `examples/traj-analysis`.

The directory meets `examples/AGENTS.md` before it is added.

## Packages

- `@trajs/core` carries a trajectory through a storage, a compression and a hash.
- The package of the API where it lives outside core, `@trajs/olap` for one.
- Every import is a `"workspace:*"` dependency of `examples/tutorials/package.json`.
- No `@trajs/utils`.

## `main.test.ts`

`vite.config.ts` includes `*/main.test.ts`, so the file name is fixed.

1. `const config = Config.config()`, with the toolkit or metric the API needs.
2. Trajectory at the top, before the reading: `Trajectory.parts(config)`, `part.prompt`,
   `part.response`, `Trajectory.make(config)(Stream.fromArray(parts))`. No part the reading does
   not need.
3. `const main = Effect.fn(function* () { … })`. Steps stay in it, so `main` is read in one pass.
   `View` calls are folds, not collects.
4. An `interface` above `main` for what it returns, and `it.effect` under it:

   ```ts
   it.effect("main", () =>
     main().pipe(
       Effect.map((report) => expect(report).toEqual({ … } satisfies Report)),
       // Session.main reads parts from Cache. Cache.layerFsTemp spills them to a temp dir.
       Effect.provide(Cache.layer()),
     ),
   );
   ```

   `Session.main` replays through `Cache`, so reading a session needs a layer.

5. What `main` is made of lives beside it: what it reads (`sessions/fixture.ts`), what it is of,
   the layers. Generated input goes in `fixtures/`, which git ignores.

## `README.md`

- The API first: what it does, how it is called, what to watch out for, on the shortest code that
  makes the call.
- Snippets parse as they stand: calls inside their `Effect.gen`, no bare `yield*` at the top.
- The case last: the trajectory, why the analysis needs this API, what reading it proves, with the
  numbers the assertion states.
- Close with `vp test <name>`.
- No "What it shows" / "When you need it" outline, no invented products, no line-by-line
  walkthrough of `main.test.ts`.

`steps` is the reference.

## List it

One line in `README.md`, naming what it teaches, not the type it returns:

```md
- [<name>](./<name>/README.md) — <what it teaches>.
```

## Check

From `examples/tutorials`: `vp test <name>`, `vp test`, `vp check`.
