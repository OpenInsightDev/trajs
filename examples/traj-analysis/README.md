# @trajs/example-traj-analysis

Worked examples of analysing a trajectory with `@trajs/core`.

Each case is one directory under [`cases/`](./cases). The analysis is `main` in `main.test.ts`,
and the test directly under it asserts what `main` returns. Open `main` for the code.

A case README is the situation and the result: what the run was, what the analysis answers, and
what it finds. An API taught on its own short trajectory is a tutorial in
[`examples/tutorials`](../tutorials) instead.

## Cases

- [compaction](./cases/compaction/README.md) — split a run at a context compaction, and list the
  files the agent had to read again.
- [metric-guided-investigation](./cases/metric-guided-investigation/README.md) — trace test results to
  their metric results and find where repeated checks stop adding evidence.
- [repeated-tool-calls](./cases/repeated-tool-calls/README.md) — report a tool call that was made
  again and again with the same arguments.
- [tokenize](./cases/tokenize/README.md) — read token counts stored with the trajectory: how the
  session grew, and what the last prompt was made of.
- [usage-across-runs](./cases/usage-across-runs/README.md) — load hundreds of trajectories into
  embedded ClickHouse and answer with SQL.

## Running

Run every case from the repository root:

```sh
vp run --filter @trajs/example-traj-analysis test
```

Or from this directory:

```sh
vp test
```

One case is named by its directory:

```sh
vp test cases/compaction
vp test cases/tokenize
```
