---
"@trajs/core": minor
---

Add `Session.all`, which reads every session a recording holds as a trajectory of
its own. The whole recording is consumed once and returned as a record keyed by
the session identifiers, each entry holding the session together with what it
inherited — the parts of each ancestor up to the part the next session is forked
from, then the session's own, as `Session.of` streams them — so a session shares
what it read with the one it forked from. An entry is bound to the recording it
was read from — it carries the toolkit, the metadata and the extension kit of that
trajectory, and its parts are held in memory — so a session can be consumed more
than once.
