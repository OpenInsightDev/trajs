# Case: sessions

A settings test fails on CI and passes locally. The main agent searches for the timeout, reads `src/config.ts`, and hands the history question to a sub-agent, `historian`. `historian` hands one commit to `archivist`.

You want each agent's share of the token bill. A sub-agent does not keep a copy of the conversation it continued from. It stores only what it did after the hand-off. The model still re-read that earlier conversation, and the provider billed the re-read.

Add those re-reads into every agent's total and the parent conversation is charged once per child. Charge only what each agent actually produced.

| session     | forked from | prompts, inherited / produced | tools                             | input  | output | share of input |
| ----------- | ----------- | ----------------------------- | --------------------------------- | ------ | ------ | -------------- |
| `main`      |             | 0 / 3                         | `grep` 1, `read_file` 1, `task` 1 | 10,700 | 772    | 0.3773         |
| `historian` | `main`      | 3 / 1                         | `bash` 1, `task` 1                | 9,770  | 560    | 0.3445         |
| `archivist` | `historian` | 4 / 1                         | `bash` 1                          | 7,890  | 380    | 0.2782         |

`historian` was billed 2,760 input tokens on its first request, and `archivist` 3,880. That first request is mostly the conversation they inherited, not the work they then did. The whole run is 28,360 input tokens and 1,712 output tokens.

The `task` calls belong to the parent. Hiring a sub-agent is the parent's action.

```sh
vp test cases/sessions
```
