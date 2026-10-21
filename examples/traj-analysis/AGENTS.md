# examples/traj-analysis

`README.md` states what the example is and lists its cases; this file is how a case is
written.

A case is written against `@trajs/core` alone — the services a trajectory is carried
through, a storage, a compression and a hash, are re-exported there — so no case imports
`@trajs/utils`, which this package does not depend on.

A case's `main` is an `Effect`, so its assertion is registered with `it.effect` from
[`@effect/vitest`](https://github.com/Effect-TS/effect/tree/main/packages/vitest): the
Effect runs as the test, and failing or dying is what fails it.

## Adding a case

1. Create `cases/<name>/main.test.ts`.
2. Write the analysis as a `main` in it, and what it is made of in modules beside
   it — what it reads, what it is of, and the layers it runs with.
3. Assert what `main` returns, right below it, in `it.effect`.
4. Write the `README.md` beside it — `# Case: <name>`, then what it shows and when you need it
   — without describing the file: the reader can open the test.

`main` is read in one pass: its steps stay in it rather than becoming functions of their own,
so a reader never leaves it to finish a thought.

A case that generates what it reads writes it under its own `fixtures/`, which
`.gitignore` keeps out of the repository.

Cases share this one package: a case is a directory under `cases/`, not a package of its
own.

## Checks

- `vp test` in `examples/traj-analysis`, or
  `vp run --filter @trajs/example-traj-analysis test` from the root.
- `vp check` in `examples/traj-analysis`.
