---
"@trajs/core": minor
---

`Session.sessions` is renamed `Session.toSessions` — reading a trajectory as the
sessions it produces. Nothing else about the reading changes: the stream, its failure
and its requirements are the ones it had.
