# @trajs/example-traj-analysis

Worked examples of analysing a trajectory with `@trajs/core`.

Each case is a directory under [`cases/`](./cases). The analysis is `main` in `main.test.ts`, and the test directly under it asserts what `main` returns. The case README is the situation and the result. Open `main` for the code. Comments there cover the API choices.

## Cases

- [turns](./cases/turns/README.md) — count prompts, text, and tool calls, one turn at a time.
- [sessions](./cases/sessions/README.md) — attribute cost to the main agent and the sub-agents it forked, without billing inherited context twice.
- [repeated-tool-calls](./cases/repeated-tool-calls/README.md) — report a tool call that was made again and again with the same arguments.
- [compaction](./cases/compaction/README.md) — split a run at a context compaction, and list the files the agent had to read again.
- [toolkit](./cases/toolkit/README.md) — count calls by the fields your tools take, and keep calls the toolkit does not describe.
- [tokenize](./cases/tokenize/README.md) — read token counts stored with the trajectory: how the session grew, and what the last prompt was made of.
- [olap](./cases/olap/README.md) — load hundreds of trajectories into embedded ClickHouse and answer with SQL.

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
vp test cases/turns
```
