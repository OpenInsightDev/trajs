---
"@trajs/core": minor
---

A trajectory's sessions are read through `Session`, a module of `@trajs/core` of its
own: `Trajectory.toSessions` is `Session.toSessions`, `Trajectory.toSessionsCached` is
`Session.toSessionsCached`, `Trajectory.session` is `Session.session`, and
`Trajectory.Fork`, `Trajectory.Session`, `Trajectory.Sessions` and
`Trajectory.SessionStream` are `Session.Fork`, `Session.Session`, `Session.Sessions` and
`Session.SessionStream`. Nothing else about them changes: they are the readings they
were, of what a trajectory's parts read as sessions.

What a trajectory is made of stays `Trajectory`'s — its parts, the config they are read
with, and `make`, `merge` and `share` — and so does `Trajectory.rootSession`, the session
a part built without one belongs to. A session's parts are `Trajectory.Part`s, and a
`Trajectory.SessionPart` declares a session that `Session.toSessions` reads rather than
being a part of one.
