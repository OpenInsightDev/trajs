# Case: olap

Two short runs: one asks where `parseConfig` is defined, the other runs the test suite. Both are written into the `parts` table, and their calls and billing are read back with SQL. One row is one part, so a question over both runs is a `GROUP BY` over the table rather than a fold over each trajectory.

The rows are named by the ids the runs were made with, `tutorial-run-1` and `tutorial-run-2`, so the rows of another trajectory in the same table are left alone.

Twelve rows in all: four calls across three tools, and 300 / 170 input tokens and 75 / 35 output tokens for the two runs.

```sh
vp test tutorials/olap
```
