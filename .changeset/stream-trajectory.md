---
"@trajs/core": minor
---

Add a stream trajectory, which records a response as the increments a model
streamed it in, and `Trajectory.fold`, which collapses one into the trajectory
`Trajectory.ResponsePart` records.

`Trajectory.StreamResponsePart(toolkit)` is the response part of a recording of
streamed parts: it carries one part of `Response.AllParts` — the start, a delta
or the end of a chunk of text or reasoning, a tool call or its result — as
`Response.AllPartsView`, so it tolerates tools outside the toolkit exactly as
`Trajectory.ResponsePart` does. `StreamMessagePart`, `StreamPart`,
`StreamResponsePartEncoded` and the tolerant `AnyStreamResponsePart`,
`AnyStreamMessagePart`, `AnyStreamPart` and `AnyStreamTrajectory` are the rest of
the part model at that granularity, and `Trajectory.makeStream` attaches the
metadata, toolkit and extension kit to a stream of those parts as
`Trajectory.make` does for a folded recording.

`Trajectory.fold` converges the increments of a chunk by the identifier the part
protocol gives them and by the session they were recorded under, so the chunks of
interleaved sessions stay apart, and emits one `text` or `reasoning` part per
chunk when it ends, with the metadata of its parts merged. The part it emits
keeps the envelope — session, timestamp and identifier — of the part that ended
the chunk. A part of a tool call's parameters or a model-reported error is
dropped, because neither has a folded form to be recorded in, and a chunk the
stream never ends is not emitted.
