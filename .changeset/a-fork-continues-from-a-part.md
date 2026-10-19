---
"@trajs/core": minor
---

`Session.Fork.part` is a `Session.ForkPart` — a prompt, a response, or a session
declaration — rather than any `Trajectory.Part`. Those three are the parts a session
continues from; the events a trajectory holds and the metrics a kit derives are read
with the parts they are attached to rather than continued from.

Both readings of a `fork` resolve it against those parts alone, so a `fork` naming an
event part is not a part a session continues from: `Session.toSessions` fails it as
`"unproduced-fork"` instead of reading it as the part the session continues from, and
`Produce.produce`'s `createSession` refuses it where the run writes it, before the
trajectory it would fail to read exists.
