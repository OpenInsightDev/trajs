# examples/traj-analysis

`README.md` states what the example is and lists its scenes and tutorials; this file is how a
case is written.

A case is written against `@trajs/core` alone — the services a trajectory is carried
through, a storage, a compression and a hash, are re-exported there — so no case imports
`@trajs/utils`, which this package does not depend on.

A case's `main` is an `Effect`, so its assertion is registered with `it.effect` from
[`@effect/vitest`](https://github.com/Effect-TS/effect/tree/main/packages/vitest): the
Effect runs as the test, and failing or dying is what fails it.

## Scenes and tutorials

A case is filed by what it answers.

- `scenes/<name>/` answers a question a real run asks, over a trajectory shaped like the one it
  comes from: a run that delegates, a context compacted mid-session, a session read for its
  tokens, hundreds of runs answered in one pass. The reading may be long and take several
  modules, because the question is not simplified to fit one.
- `tutorials/<name>/` shows one API on a short, simple trajectory, so a reader who learns it is
  not also reading an analysis. The trajectory is the smallest one the API is visible on.

A case that would only be a shorter scene belongs in `tutorials/`. A case whose question would
be contrived on a two-turn trajectory belongs in `scenes/`. A question worth both is filed twice,
as [`scenes/usage-across-runs`](./scenes/usage-across-runs) and
[`tutorials/olap`](./tutorials/olap) are: the scene answers it at scale, the tutorial shows the
API on two runs.

## Adding a case

1. Create `scenes/<name>/main.test.ts` or `tutorials/<name>/main.test.ts`.
2. Write the analysis as a `main` in it, and what it is made of in modules beside
   it — what it reads, what it is of, and the layers it runs with.
3. Assert what `main` returns, right below it, in `it.effect`.
4. Write `README.md` in plain language, for the reader the directory is filed for.

   A scene README is the scenario: what the run was, what question the analysis answers, and what
   it finds. It does not explain an API. That belongs in a short comment in `main.test.ts`, next to
   the call, and only where the call is not obvious from its name.

   A tutorial README teaches the API first: what it does, how it is called, and what to watch out
   for, shown on the shortest code that makes the call. The case comes last — the small trajectory,
   why the analysis needs this API, and what reading it proves. A fenced snippet is formatted like
   the code it holds, so it has to parse as it stands: put the calls inside the `Effect.gen` they
   run in rather than leaving a bare `yield*` at the top.

   Both say how to run the case (`vp test scenes/<name>` or `vp test tutorials/<name>`), neither
   uses a "What it shows" / "When you need it" outline or invents products the case could feed, and
   neither describes what `main.test.ts` already shows line by line.

`main` is read in one pass: its steps stay in it rather than becoming functions of their own,
so a reader never leaves it to finish a thought.

A case that generates what it reads writes it under its own `fixtures/`, which
`.gitignore` keeps out of the repository.

Cases share this one package: a case is a directory under `scenes/` or `tutorials/`, not a
package of its own.

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
- One case is `vp test scenes/<name>` or `vp test tutorials/<name>`.
- `vp check` in `examples/traj-analysis`.
