# Case: metric

A failing settings test sends the agent looking for the timeout. It greps for `readTimeout`, reads `src/config.ts`, answers, then opens a screenshot of the settings page to check one more thing.

You want to know how much text the tool results handed back. That text is context the agent carries without having written it. One of the results is a picture rather than text, so there is no length to report for it.

Two results hold text: 16 characters from `grep` and 64 from `read_file`, 80 in all. The screenshot is reported as the one result that could not be measured.

```sh
vp test tutorials/metric
```
