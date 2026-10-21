# Case: olap

## What it shows

Hundreds of trajectories read at once. The parts of every run are written as rows of a table in
the ClickHouse engine `chdb` embeds, so a question about all of them is a `GROUP BY` rather than
a fold in memory: shares, averages, and per-day totals answered over thousands of rows.

## When you need it

- Usage across many runs: the share each tool and each model got, prompts per session, how often
  a run delegates to a sub-agent.
- Cost: tokens per day, per team or per model, read off the parts that state a usage.
- Comparing two windows of runs — before and after a prompt or model change — with the same
  queries.
