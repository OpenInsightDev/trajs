---
name: add-case
description: Use when adding, rewriting, or reviewing a case in `examples/traj-analysis`. Covers the packages it is written against, `main.test.ts`, the README, the list in `README.md`, and the checks.
---

# Add a case

One question a real run asks, per directory under `cases/`.
The reading may be long and take several modules; the question is not simplified to fit one.
An API taught on its own short trajectory is a tutorial in `examples/tutorials`, not a case.

The directory meets `examples/AGENTS.md` before it is added.

## Packages

- `@trajs/core` carries the trajectory: `Cache`, `Session`, `Trajectory`, `View`, `Exchange`.
- A package the case needs (`@trajs/olap`, `@trajs/extension-tokenize`) is a `"workspace:*"`
  dependency of `examples/traj-analysis/package.json`.
- No `@trajs/utils`.

## `main.test.ts`

`cases/<name>/main.test.ts`; `vite.config.ts` runs every `cases/**/*.test.ts`.

1. The trajectory shaped like the run it comes from: a run that delegates, a context compacted
   mid-session, hundreds of runs answered in one pass.
2. `main` is an Effect, taking the case's parameters where it has them. Steps stay in it, so `main`
   is read in one pass. A reading is a fold, not a collect.
3. An `interface` above `main` for what it returns, and `it.effect` under it:

   ```ts
   it.effect("main", () =>
     main().pipe(
       Effect.map((report) => expect(report).toEqual({ … } satisfies Report)),
       Effect.provide(layer),
     ),
   );
   ```

4. What `main` is made of lives beside it: what it reads (`fixture.ts`, `produce.ts`), what it is
   of (`table.ts`), the layers.
5. Generated input goes in `fixtures/`, which git ignores.

## `README.md`

- The situation: what the run was, what question the case answers, what it finds.
- The numbers the assertion states, so the README and the test agree.
- No API explanation. That is one comment in `main.test.ts`, next to the call, only where the name
  does not carry it.
- Close with `vp test cases/<name>`.
- No "What it shows" / "When you need it" outline, no invented products, no line-by-line
  walkthrough of `main.test.ts`.

`compaction` is the reference.

## List it

One line in `README.md`, naming the question it answers:

```md
- [<name>](./cases/<name>/README.md) — <the question it answers>.
```

## Check

From `examples/traj-analysis`: `vp test cases/<name>`, `vp test`, `vp check`.
