---
"@trajs/core": minor
---

`View.steps` reads a trajectory as the steps its parts state: a prompt a model was
given, the responses a model produced together, or an event of the run. `View.Step` is
one of them, tagged as `View.PromptStep`, `View.ResponseStep` or `View.EventStep`.

A step holds the trajectory parts that state it. A prompt step holds the whole
`Trajectory.PromptPart`, with its messages and the moment of the request. A response
step holds the folded response parts, in the order they were produced. An event step
holds the `Trajectory.EventPart`.

Session declarations and metric parts are not steps, and a metric part does not end a
run of responses. A run of response parts ends at the prompt or event that follows it,
and at the end of the parts. Streaming increments are folded into the parts they
complete, and a chunk an event interrupts stays open across it.

A prompt turn is no longer a reading of its own: `View.promptTurns` and
`View.PromptTurn` are removed. A program reads a session with `View.steps` instead.
