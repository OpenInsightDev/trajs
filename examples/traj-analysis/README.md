# @trajs/example-traj-analysis

Worked examples of analysing a trajectory with `@trajs/core`.

Each case is one directory under [`cases/`](./cases): a `main.test.ts` whose subject is a
`main`, beside the modules it is made of and a `README.md` that states what it shows.
The `main` is the analysis the case demonstrates, and the way the case reads it is asserted
right below it, so what the code does and what it expects are read together.

## Cases

- [turns](./cases/turns/README.md) — reads a trajectory as the turns its
  conversation was produced in and summarises it.
- [session-tree](./cases/session-tree/README.md) — reads a run as the sessions it was forked
  into: what each inherited from the session it continues from, what it did, and what it and
  the sessions forked off it cost.
- [repeated-tool-calls](./cases/repeated-tool-calls/README.md) — reads a trajectory
  as the tool calls it holds and reports the ones made over and over.
- [toolkit](./cases/toolkit/README.md) — reads a trajectory typed with the toolkit
  its responses were returned by, so each call is counted in the terms its own tool's
  parameters state.
- [tokenize](./cases/tokenize/README.md) — produces a trajectory with the token count
  of each of its parts, and reads it back for how the session grew and what its context
  was made of.
- [olap](./cases/olap/README.md) — generates hundreds of trajectories from
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

One case is named by its directory:

```sh
vp test cases/turns
```
