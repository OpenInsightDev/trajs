# examples/tutorials

`README.md` states what a tutorial is and lists them; this file is how one is written.

A tutorial is written against `@trajs/core` — the services a trajectory is carried through, a
storage, a compression and a hash, are re-exported there — and against the package of the API it
teaches where that API lives outside `@trajs/core` ([`@trajs/olap`](../../packages/olap) is).
No tutorial imports `@trajs/utils`, which this package does not depend on.

## Adding a tutorial

1. Create `<name>/main.test.ts`.
2. Write the analysis as a `main` in it, and what it is made of in modules beside it.
3. Assert what `main` returns, right below it, in `it.effect`.
4. Write `README.md` in plain language, teaching the API first: what it does, how it is called,
   and what to watch out for, shown on the shortest code that makes the call. The case comes
   last — the small trajectory, why the analysis needs this API, and what reading it proves. A
   fenced snippet is formatted like the code it holds, so it has to parse as it stands: put the
   calls inside the `Effect.gen` they run in rather than leaving a bare `yield*` at the top.

   The README says how to run the tutorial (`vp test <name>`), does not use a "What it shows" /
   "When you need it" outline, does not invent products the tutorial could feed, and does not
   describe what `main.test.ts` already shows line by line.

## Checks

- `vp test` in `examples/tutorials`, or
  `vp run --filter @trajs/example-tutorials test` from the root.
- One tutorial is `vp test <name>`.
- `vp check` in `examples/tutorials`.
