---
"@trajs/core": minor
---

The part builders take what a part is built of first, then the fields it is built
with: `Trajectory.promptPart` takes the prompt, `Trajectory.responsePart` the
response, and `Trajectory.sessionPart` the id of the session, each followed by the
fields the part is produced with — `sessionId`, `timestamp` and `extra`.

`sessionId` is optional on a prompt or response part, and a part built without
one belongs to `Trajectory.rootSession` — the session `"root"` — so a part
produced beside a session still belongs to one.
