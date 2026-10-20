# @trajs/example-traj-analysis

Worked examples of analysing a trajectory with `@trajs/core`.

Each case is one file under [`cases/`](./cases): a `main.test.ts` whose subject is a
`main`. The `main` is the analysis the case demonstrates, and the way the case reads it
is asserted right below it, so what the code does and what it expects are read
together.

## Cases

- [turns](./cases/turns/main.test.ts) — reads a trajectory as the turns its
  conversation was produced in and summarises it.
- [repeated-tool-calls](./cases/repeated-tool-calls/main.test.ts) — reads a trajectory
  as the tool calls it holds and reports the ones made over and over.
- [olap](./cases/olap/main.test.ts) — generates hundreds of trajectories from
  known weights, imports them into the ClickHouse engine `chdb` embeds, and
  answers the shares and averages they were drawn from with SQL aggregates over
  the parts.

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
2. Write the analysis as a `main` in it, and what it is made of in modules beside
   it — what it reads, what it is of, and the layers it runs with.
3. Assert what `main` returns, right below it.

A case that generates what it reads writes it under its own `fixtures/`, which
`.gitignore` keeps out of the repository.

The example is private and never published, so a case adds no package of its own.
