---
"@trajs/core": minor
---

A prompt, response, event or metric part states `startTimestamp` where its producer
measured when it began, so a part covers a span rather than a moment. The span is from
`startTimestamp` to `timestamp`, and `timestamp` still states the moment the part was
produced: a part that is written when its output completes covers how long that output
took. The field is optional throughout, and a part without it covers the moment its
`timestamp` states, exactly as it always did. The builders of `Trajectory.parts` state it
beside `timestamp`, and the exchange writes it without reading an older part
differently.

The session of `Produce.produce` states both moments among the fields a part is built
with: `enqueuePrompt`, `enqueueResponse` and `enqueueEvent` take `timestamp` and
`startTimestamp` in their options rather than `timestamp` beside them, so what a part is
built of is stated in one place and no call states a fourth argument. An event states a
moment where it states one, and the moment it is produced where it states none.
