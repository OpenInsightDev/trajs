# Splitting a run into sessions

A trajectory is not always one conversation. When an agent hands work to a
sub-agent, that agent's parts are recorded in the same stream under its session
id, and the sub-session declares the part it forked from. `Session.main`
validates those declarations and returns the tree they describe, so a program
can read the run and every sub-agent separately.

```ts
const main = Effect.gen(function* () {
  const root = yield* Session.main(trajectory);

  const sessions = Session.all(root); // depth first, root first
  const historian = Session.find(root, "historian"); // Option
});
```

Each node in the tree carries four things:

- `session.stream` holds only this session's own parts. The conversation it
  inherited is not in it.
- `Session.stream(session)` replays the inherited prefixes from the root down to
  the fork, then the session's own parts. This is what that agent could see.
- `forkFrom` is the parent session and the uuid of the part forked at.
- `forkBy` holds the direct children, keyed by session id.

The split matters most for usage. A provider bills the conversation on every
request, so a sub-agent's first request is mostly the context it inherited — and
that context is already counted in the parent's usage. Sum usage over
`Session.stream` and each replayed prefix is billed once per session that
replays it. Sum it over `session.stream` to charge each agent for the work it
did.

`Session.main` reads through `Cache` and replays each session from it, so the
effect needs `Cache.layer()` or `Cache.layerFsTemp()`. A sub-session has to be
declared before its first prompt, response, or event, and a fork has to name an
earlier prompt, response, or session declaration; anything else fails with
`TrajectoryError`. A fork made at a session declaration inherits no parts at
all.

The run here has a main session that forks `historian` at a `task` call, and
`historian` that forks `archivist` the same way. Read per session, the billing
is 10,700 input tokens for `main`, 9,770 for `historian`, and 7,890 for
`archivist` — 28,360 in all. `historian`'s first request was 2,760 of its 9,770,
almost all of it inherited context. The `task` calls are counted as the
parent's, because hiring the sub-agent was the parent's action.

```sh
vp test sessions
```
