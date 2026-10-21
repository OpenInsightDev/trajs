# Case: toolkit

## What it shows

Tool calls read in the terms of the tools that made them. A toolkit declared once types every
call by the name it carries, so an analysis reads the parameters a tool actually takes — a city,
a page size, a path — instead of a payload of `unknown`. A call of a tool the toolkit does not
describe is still read, and counted apart rather than dropped.

## When you need it

- Per-tool analytics over your own tool set: which tools runs lean on, and what they were asked
  to do.
- A tool added in production: it shows up as an undescribed call while the toolkit catches up,
  rather than breaking the report.
- Policy checks on parameters — a limit over N, a path outside the repository — before a call is
  replayed.
