# @trajs/example-traj-analysis

Worked examples of analysing a trajectory with `@trajs/core`.

Each case is one directory under [`scenes/`](./scenes) or [`tutorials/`](./tutorials). The analysis
is `main` in `main.test.ts`, and the test directly under it asserts what `main` returns. The case
README is the situation and the result. Open `main` for the code. Comments there cover the API
choices.

## Scenes

- [compaction](./scenes/compaction/README.md) — split a run at a context compaction, and list the
  files the agent had to read again.
- [repeated-tool-calls](./scenes/repeated-tool-calls/README.md) — report a tool call that was made
  again and again with the same arguments.
- [tokenize](./scenes/tokenize/README.md) — read token counts stored with the trajectory: how the
  session grew, and what the last prompt was made of.
- [usage-across-runs](./scenes/usage-across-runs/README.md) — load hundreds of trajectories into
  embedded ClickHouse and answer with SQL.

## Tutorials

- [steps](./tutorials/steps/README.md) — count prompts, replies, text, and tool calls, one step at
  a time.
- [sessions](./tutorials/sessions/README.md) — attribute cost to the main agent and the sub-agents
  it forked, without billing inherited context twice.
- [toolkit](./tutorials/toolkit/README.md) — count calls by the fields your tools take, and keep
  calls the toolkit does not describe.
- [metric](./tutorials/metric/README.md) — measure the text each tool result handed back, and read
  what the metric could not measure.
- [olap](./tutorials/olap/README.md) — write two short runs into the parts table and answer their
  calls and billing with SQL.

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
