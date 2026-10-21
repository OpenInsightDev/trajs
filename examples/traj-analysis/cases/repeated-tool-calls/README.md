# Case: repeated-tool-calls

## What it shows

The shape a stuck agent takes: the same call, with the same input, made again and again. Calls
made one after another with equal input are read as one repeat — compared structurally, so the
ids they carry do not matter — and a repeat longer than a threshold is reported with the calls
that made it.

## When you need it

- Finding the runs that loop, where one retried command is most of what a session cost.
- Monitoring sessions as they arrive: the same reading, with the threshold set per tool, makes an
  alarm instead of a report.
- Reviewing evals, where a degenerate trajectory shows as repeats before it shows in a score.
