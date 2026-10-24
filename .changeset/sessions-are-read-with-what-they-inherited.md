---
"@trajs/core": minor
---

`Session.stream(main, id)` reads the parts a session was given: what each session it
continues from produced up to the part it continues from, from the main session down, then
what the session produced itself. A session continuing from the declaration of the session
it continues from inherits none of its parts, since a declaration places a session rather
than being a message of it.

The stream fails with a `TrajectoryError` where `id` names no session of the reading,
which is the new `SessionErrorReason` `"unknown-session"`. It is dual: `Session.stream(main, id)`
reads data-first, and `pipe(main, Session.stream(id))` data-last.
