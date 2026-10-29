# @trajs/example-tutorials

Tutorials for the `@trajs` APIs. Each directory teaches one API: what it does, how it is called,
and what to watch out for, shown on the shortest trajectory the API is visible on.

Each tutorial is `main.test.ts` inside its directory. The analysis is `main`, and the test
directly under it asserts what `main` returns. Open `main` for the code; `README.md` is the
lesson.

A whole run read for what it asks — a context compacted mid-session, hundreds of runs answered
in one pass — is a case in [`examples/traj-analysis`](../traj-analysis) instead.

## Tutorials

- [steps](./steps/README.md) — read a session as prompts and replies with `View.steps`, instead
  of counting the parts a reply is made of.
- [sessions](./sessions/README.md) — split a delegating run into sessions with `Session.main`,
  and charge each agent for its own parts.
- [toolkit](./toolkit/README.md) — declare tools on the config so a call's params are typed, and
  keep the calls to tools it does not declare.
- [metric](./metric/README.md) — declare a metric, measure parts with a producer, and read what
  it could not measure.
- [metric-trajectory](./metric-trajectory/README.md) — read a trajectory into parts that carry
  the results naming them with `View.metricTrajectory`.
- [extras](./extras/README.md) — write a harness's own fields onto parts, versioned so a record
  written before a rename still reads.
- [olap](./olap/README.md) — write runs into ClickHouse and answer their calls and billing with
  SQL.
- [cache](./cache/README.md) — read a source once and replay it, with the newest parts in memory and
  the rest spilled to a byte store.

## Running

Run every tutorial from the repository root:

```sh
vp run --filter @trajs/example-tutorials test
```

Or from this directory:

```sh
vp test
```

One tutorial is named by its directory:

```sh
vp test steps
vp test metric
```
