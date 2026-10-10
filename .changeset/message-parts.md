---
"@trajs/core": minor
---

Split the trajectory part model into message parts and extension parts. A part is
either the trajectory data of a recording — `Trajectory.MessagePart(toolkit)`,
the prompt part, the session part and the response parts the toolkit describes —
or the data recorded for an extension about it
(`Trajectory.ExtensionPart(extkit)`), so `Trajectory.Part(toolkit, extkit)` and
the types it yields are composed of the two: `Trajectory.Part<Tools, Exts>` is
now `MessagePart<Tools> | ExtensionPart<Exts>` and `Trajectory.AnyPart` is
`AnyMessagePart | AnyExtensionPart`.

`Trajectory.MessageStream` and `Trajectory.AnyMessageStream` are the streams of
those message parts and `Trajectory.MessagePartEncoded` their encoded form.
`Trajectory.messages` streams the message parts of a recording in the order they
were recorded, dropping the extension data recorded alongside them.
