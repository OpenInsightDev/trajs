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

## Reading a case

A case is read before it is run, so it is written for a reader with no context beyond the
case directory.

- A concept is defined before it is used. A reader who meets a name follows it to its
  definition, not to a search.
- The file answers in order: what it produces, what it reads, how it reads it, and what
  the assertion proves.
- A name states what it holds. A shape and the state it is filled from read as a pair, not
  as two unrelated things.
- One rule is one concept. A structure that exists only to support another is removed, not
  documented.
- A field or helper whose meaning the name does not carry states it in one JSDoc line.
- Comments stand where the code and the types cannot speak: a fixture step whose purpose
  the code does not show, a rule the analysis depends on, a convention the source format
  does not carry.

A case meets this before it is added, whatever its assertion proves.

## Checks

- `vp test` in `examples/traj-analysis`, or
  `vp run --filter @trajs/example-traj-analysis test` from the root.
- `vp check` in `examples/traj-analysis`.
