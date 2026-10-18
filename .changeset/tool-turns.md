---
"@trajs/core": minor
---

`Toolkit.toolTurns` reads a trajectory as the tool turns it holds: every tool a model
called, with the result that call was answered with. `Toolkit.ToolTurn` is one of them,
and the two parts of it are read through the toolkit, so a call or a result of a tool the
toolkit does not describe reads as the part the trajectory holds rather than failing to
read at all.

The two parts of a turn are paired by the id both carry, so a call a trajectory holds no
final result for is not a tool turn, and neither is a result whose call the reading never
saw. A preliminary result is the progress of a call rather than the answer to it and is
read past, so the result of a turn is the final one. A trajectory is read once: a call is
held only until the result that answers it arrives.
