# Case: extras

The harness that ran this agent kept its own record beside the conversation. For
each answer it noted the model that produced it and the effort it was called
with. For the run it noted the agent that produced it and the task it was given.
None of that is in the messages.

You want those settings back: which answer came from which model, whether the
run changed models, and who ran it. The harness has since renamed `model_name` to
`model`, so what it recorded before has to keep reading.

The search for `TIMEOUT_MS` was answered by `gpt-4.1-mini` at low effort. The
answer to the follow-up came from `gpt-4.1` at high effort, and called no tool.
The run was produced by `cline@3.1.0` for task `t-204`.

The first record was written before the rename. It still reads as today's field,
so the two answers are read the same way.

```sh
vp test tutorials/extras
```
