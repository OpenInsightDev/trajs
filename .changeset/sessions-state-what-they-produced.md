---
"@trajs/core": minor
---

`Session.Session` states the two readings it is made of: `own` is the parts it produced itself, and
`inherited` is what it inherited from each session it continues from — from the root down, each with
the id of the session that produced it (`Session.Inheritance`). `stream` is what it ran on, holding
the two together.

A part states the session it was produced in and belongs to the main session where it states none.
That rule is now applied where a session is read rather than by every program that reads a
trajectory: what a session did reads apart from what it started on without filtering a `stream` for
the parts that state its id.
