---
"@trajs/core": minor
---

`Session.Sessions` is the sessions of a trajectory in the order the trajectory named
them — the main session first, then each session after the one it continues from — rather
than a record by id.

What the record was read for is what the reading states: reading every session is one
pass over the sessions themselves, each with what it ran on, and
`Session.session(id)(sessions)` is the session an id names, `None` where the reading
holds none. `SessionTree.make` reads that reading as the tree its forks place,
so a session forked off another is found by walking the tree rather than by filtering
the sessions for the ones that name it.
