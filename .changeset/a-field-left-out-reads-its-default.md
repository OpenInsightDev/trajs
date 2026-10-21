---
"@trajs/core": minor
---

A field `Trajectory.config` is not given reads as the default of that field: a kit left out is
the empty kit of its kind — `Toolkit.empty`, `EventKit.empty`, `MetricKit.empty`,
`ExtraKit.empty` — and a variant left out is `true`, the reading that carries the response
parts of either kind. So `Trajectory.config({ stream: false, toolkit })` states what it always
did, a reading that names one kit no longer writes out the others beside it, and a call that
states nothing — `Trajectory.config()` — is `UnknownConfig`. What it returns is the `Config` it
always was, stating every field, so nothing taking a config reads differently.
