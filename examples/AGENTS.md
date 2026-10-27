# examples

Each directory here is written for a reader with no context beyond it, because it is read
before it is run: a case asks a question a real run asks, a tutorial teaches one API.

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

A directory meets this before it is added, whatever its assertion proves.

## Shape

`main.test.ts` holds the analysis as a `main` and, right under it, the assertion of what `main`
returns. `main` is an `Effect`, so the assertion is registered with `it.effect` from
[`@effect/vitest`](https://github.com/Effect-TS/effect/tree/main/packages/vitest): the Effect
runs as the test, and failing or dying is what fails it. What the analysis is made of lives in
modules beside it — what it reads, what it is of, and the layers it runs with.

`main` is read in one pass: its steps stay in it rather than becoming functions of their own,
so a reader never leaves it to finish a thought.

A directory that generates what it reads writes it under its own `fixtures/`, which
`.gitignore` keeps out of the repository.

Each directory shares its package: a directory is not a package of its own.

## Where a question is filed

A question a real run asks is a case, in [`traj-analysis/cases`](./traj-analysis/cases), over a
trajectory shaped like the one it comes from: a run that delegates, a context compacted
mid-session, hundreds of runs answered in one pass. The reading may be long and take several
modules, because the question is not simplified to fit one.

An API taught on its own is a tutorial, in [`tutorials`](./tutorials), on the shortest
trajectory the API is visible on, so a reader who learns it is not also reading an analysis.

A question worth both is filed twice, as
[`traj-analysis/cases/usage-across-runs`](./traj-analysis/cases/usage-across-runs) and
[`tutorials/olap`](./tutorials/olap) are: the case answers it over hundreds of runs, the
tutorial shows the API on two.
