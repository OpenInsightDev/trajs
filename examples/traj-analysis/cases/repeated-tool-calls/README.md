# Case: repeated-tool-calls

The agent looks for `parseConfig`. It searches for the same pattern three times, reads `src/config.ts` twice, then runs `bun test` three times.

You want the loops, not a list of every call. Reading the same file twice is ordinary. Doing the same thing three times in a row is stuck. A different action in between ends the streak, so the searches and the test runs are two separate loops.

Eight tool calls in all. The loops are the three searches (`call_1`, `call_2`, `call_3`) and the three test runs (`call_6`, `call_7`, `call_8`).

```sh
vp test cases/repeated-tool-calls
```
