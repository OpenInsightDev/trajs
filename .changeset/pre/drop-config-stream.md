---
"@trajs/core": minor
---

A trajectory carries finished response parts and nothing else, so a config no longer
states a response variant. `Config.stream`, the `Stream` type parameter of `Config`,
`Config.NonStreamConfig` and `Config.UnknownConfig` are removed; `Config.anyConfig`
no longer carries `stream: true`, and `Config.MergedConfig` no longer unions a
variant.

`Trajectory.ResponsePart` loses its third type parameter and is the finished
`Response.Part` of the toolkit for every config. `Trajectory.Parts.response` takes
such a part, `Trajectory.Part` reads one back, and `Trajectory.ResponsePartOf` is
`ResponsePart<C["toolkit"], C["extrakit"]>`.

`Response.PartView` is the view of a part a trajectory holds. `Response.AllPartsView`
stays the view of the parts a response arrives in, which production folds.

`Produce.MessageStream` carries finished parts, and `Produce.ProducingConfig` is the
one config a production run states — the `stream: true` a run used to emit is gone
with the flag.

`Produce.ProduceSession.enqueueResponse` takes the parts a response arrives in and
folds an answer that is still being written into the chunk it builds, so the
trajectory holds the part that chunk ended in. It answers with the part it wrote,
which is `Option.none` while the answer is still arriving. A chunk still open when the
run ends is not written.

`View.steps` no longer folds response increments, and `Metric` producers read
finished parts directly rather than through a fold.
