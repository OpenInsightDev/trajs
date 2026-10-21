---
"@trajs/core": minor
---

The parts of a trajectory are built by the config they are read with:
`Trajectory.parts(config)` gives one builder per kind of part — `prompt`, `session`,
`response`, `event` and `metric` — so a part states the kits its trajectory is read
with rather than naming them beside it, and a response part is of the variant the
config states rather than of one asked for at the call. `promptPart`, `sessionPart` and
`responsePart` are removed: what they built for a kit alone is built by the builders of
the config that names that kit, and the schemas they were built from remain
(`PromptPart`, `SessionPart`, `ResponsePart`, `EventPart`, `MetricPart`). A builder
states the `uuid`, `timestamp` and `sessionId` a caller knows, so a trajectory written
twice from stated identities is the same bytes — which is what a part a fork names
needs.
