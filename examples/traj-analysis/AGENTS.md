# AGENTS.md

Each directory under `cases/` answers one question a real run asks.
`README.md` is the situation and what it finds; `main.test.ts` is the analysis.
`README.md` lists the cases.
Run one with `vp test cases/<name>`, all with `vp test`.
An API taught on its own short trajectory is a tutorial in `examples/tutorials`, not a case.

## For Maintainers

Follow these ONLY if you are a maintainer:

- If asked to add a new case, MUST use the `add-case` skill in `$PWD/.agents/skills` first.
