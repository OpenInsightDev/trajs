---
"@trajs/core": minor
---

Move the trajectory prompt views into a new `View` module. `Trajectory.prompt`
becomes `View.prompt`, and the turn view it is folded from is exported as
`View.promptTurns`, returning `View.PromptTurn`. `Trajectory` now holds the part
model only.
