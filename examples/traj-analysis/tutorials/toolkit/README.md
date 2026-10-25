# Case: toolkit

The agent checks the weather in Paris and Berlin, searches the docs for a retry policy and for backoff, and reads one TypeScript file and one Markdown file. It also fetches a page with a tool this report was never told about.

You want the calls counted in each tool's own words. The cities, the search queries, the largest page size asked for (20), and the file extensions (`ts`, `md`). The unknown fetch should show up as one extra call. It should not vanish, and it should not fail the report.

```sh
vp test tutorials/toolkit
```
