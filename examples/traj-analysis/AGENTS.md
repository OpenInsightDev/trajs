# examples/traj-analysis

`README.md` states what the example is and lists its cases; this file is how a case is written.

A case is written against `@trajs/core` alone — the services a trajectory is carried through, a
storage, a compression and a hash, are re-exported there — so no case imports `@trajs/utils`,
which this package does not depend on.

## Adding a case

1. Create `cases/<name>/main.test.ts`.
2. Write the analysis as a `main` in it, and what it is made of in modules beside it.
3. Assert what `main` returns, right below it, in `it.effect`.
4. Write `README.md` in plain language, for the reader the directory is filed for: the scenario —
   what the run was, what question the analysis answers, and what it finds.

   The README does not explain an API. That belongs in a short comment in `main.test.ts`, next to
   the call, and only where the call is not obvious from its name. It says how to run the case
   (`vp test cases/<name>`), does not use a "What it shows" / "When you need it" outline, does
   not invent products the case could feed, and does not describe what `main.test.ts` already
   shows line by line.

## Checks

- `vp test` in `examples/traj-analysis`, or
  `vp run --filter @trajs/example-traj-analysis test` from the root.
- One case is `vp test cases/<name>`.
- `vp check` in `examples/traj-analysis`.
