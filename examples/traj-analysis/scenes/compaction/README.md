# Case: compaction

The agent is chasing a timeout that fails on CI. It finds `readTimeout`, reads `src/config.ts`, and explains the bug. The harness then compacts the context, and the file is no longer in front of the model. The agent reads `src/config.ts` again before it can edit the file.

You want the run split into before and after that compaction, plus the files that had to be opened a second time. Here that list is only `src/config.ts`. The run is 4 prompts, 4 replies, and 1 compaction.

```sh
vp test scenes/compaction
```
