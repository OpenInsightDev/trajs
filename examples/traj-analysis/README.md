# @trajs/example-traj-analysis

Worked examples of analysing a trajectory with `@trajs/core`.

Each case is one file under [`cases/`](./cases): a `main.test.ts` whose subject is a
`main`. The `main` is the analysis the case demonstrates, and the way the case reads it
is asserted right below it, so what the code does and what it expects are read
together.

## Cases

- [turns](./cases/turns/main.test.ts) — reads a trajectory as the turns its
  conversation was produced in and summarises it.

## Running

Run every case from the repository root:

```sh
vp run --filter @trajs/example-traj-analysis test
```

Or from this directory:

```sh
vp test
```

## Adding a case

1. Create `cases/<name>/main.test.ts`.
2. Write the analysis as a `main` in it.
3. Assert what `main` returns, right below it.

The example is private and never published, so a case adds no package of its own.
