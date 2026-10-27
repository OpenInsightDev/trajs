# Case: usage-across-runs

Two weeks of agent runs, 420 of them, 30 a day. You want the usual questions in one place. Which tools were used, which models answered, how many prompts a session averages, how often a run spawned a sub-agent, and how many tokens each day cost.

Walking every trajectory in the program to answer that does not stay cheap. This case loads every part into one table and asks with SQL. The database runs inside the test. Nothing is uploaded.

The runs are generated from known odds, so the test can check the answers. Tools should land near `grep` 50%, `read_file` 25%, `bash` 15%, `edit` 10%. Models near `gpt-5` 60% and `claude-sonnet-4-6` 40%. About a quarter of the runs have a sub-agent.

The same questions on two short runs, without the generator, are
[`examples/tutorials/olap`](../../../tutorials/olap/README.md).

```sh
vp test cases/usage-across-runs
```
