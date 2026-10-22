---
"@trajs/core": minor
"@trajs/extension-atif": minor
"@trajs/extension-tokenize": minor
"@trajs/olap": minor
---

A trajectory has a main session, and every other session continues from it.

`Trajectory.mainSessionId` names it — `"main"` — and `Trajectory.SessionPart`
declares which of the two kinds of session a part is: `main`, the one session a
trajectory reads without a declaration, or `sub`, a session of its own named by its
`id` and continuing from the part its `fork` names. `ProduceSession.forkSession`
opens such a session and hands back what produces in it, forking from the part it
is given and defaulting to the declaration of the session it is opened from.

A part's `sessionId` is optional: a part that states none, or states `"main"`,
belongs to the main session. So `Trajectory.Parts` builds one with
`mainSession()` where it built a session part out of an id alone — `session` is
gone — and `subSession(id, { fork })` builds one of the other kind. `Session.extra`
is the extra data the declaration of a session states, and `Trajectory.parts`'
builders take the extra data of a part beside its fields rather than under `extra`.

`Session.toSessions` reads a session of its own only from the part that declares
it: a part naming one no session part declares fails the reading with the new
`SessionErrorReason` `"undeclared-session"`. The main session needs no declaration.

`Produce.produce` hands the program the main session's `ProduceSession` rather
than a `Producer` of sessions, and declares that session before the program runs,
with the extra data the config states of a session part beside it. `Produce.Producer`
and `ProduceSession.createSession` are gone. `Produce.fromSessions` takes a record
whose `main` entry is the main session and whose every other entry is a
`SessionSource` — the `messages` the session produces, the session it is `subTo`,
and the extra data it states of it — and declares them in that order of fork.
`Produce.PartStream` is `Produce.MessageStream`.

Where a part states no session, `@trajs/olap` writes the main session's id as the
row's `session_id`, and `@trajs/olap`'s `Row` docs say so; `@trajs/extension-tokenize`
counts such a part as a part of the main session. `@trajs/extension-atif` produces a
document's run as a session forked from the main one, with what the document states
of the run declared with it.
