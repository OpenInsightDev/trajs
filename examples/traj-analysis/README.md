# @trajs/example-traj-analysis

Worked examples of analysing a trajectory with `@trajs/core`.

Each case is one directory under [`scenes/`](./scenes) or [`tutorials/`](./tutorials). The analysis
is `main` in `main.test.ts`, and the test directly under it asserts what `main` returns. Open `main`
for the code.

A scene README is the situation and the result: what the run was, what the analysis answers, and
what it finds. A tutorial README teaches the API first — what it does, how to call it, what to watch
out for — and ends with the short case that exercises it.

## Scenes

- [compaction](./scenes/compaction/README.md) — split a run at a context compaction, and list the
  files the agent had to read again.
- [metric-guided-investigation](./scenes/metric-guided-investigation/README.md) — trace test results to
  their metric reports and find where repeated checks stop adding evidence.
- [repeated-tool-calls](./scenes/repeated-tool-calls/README.md) — report a tool call that was made
  again and again with the same arguments.
- [tokenize](./scenes/tokenize/README.md) — read token counts stored with the trajectory: how the
  session grew, and what the last prompt was made of.
- [usage-across-runs](./scenes/usage-across-runs/README.md) — load hundreds of trajectories into
  embedded ClickHouse and answer with SQL.

## Tutorials

- [steps](./tutorials/steps/README.md) — read a session as prompts and replies with `View.steps`,
  instead of counting the parts a reply is made of.
- [sessions](./tutorials/sessions/README.md) — split a delegating run into sessions with
  `Session.main`, and charge each agent for its own parts.
- [toolkit](./tutorials/toolkit/README.md) — declare tools on the config so a call's params are
  typed, and keep the calls to tools it does not declare.
- [metric](./tutorials/metric/README.md) — declare a metric, measure parts with a producer, and read
  what it could not measure.
- [metric-trajectory](./tutorials/metric-trajectory/README.md) — read a trajectory into parts that
  carry the reports naming them with `View.metricTrajectory`.
- [extras](./tutorials/extras/README.md) — write a harness's own fields onto parts, versioned so a
  record written before a rename still reads.
- [olap](./tutorials/olap/README.md) — write runs into ClickHouse and answer their calls and billing
  with SQL.

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
vp test scenes/compaction
vp test tutorials/steps
```
