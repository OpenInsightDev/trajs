---
"@trajs/core": minor
---

Add `Trajectory.prompt`, which folds a recording back into the prompt its model
was given: the messages of every turn, concatenated with the response parts
recorded for them, in order. A prompt part opens a turn and the response parts
that follow it belong to it; session and extension parts are skipped, and
response parts that no prompt precedes are dropped. Parts are not attributed to a
session, so a recording that interleaves several is selected with `Session.of` or
`Session.select` before it is folded.
