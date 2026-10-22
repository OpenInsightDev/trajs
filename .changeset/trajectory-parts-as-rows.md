---
"@trajs/olap": minor
---

A trajectory's parts as the rows an OLAP store aggregates them in: `@trajs/olap`
states the `parts` table (`Parts`), the write that imports a trajectory under the
id it carries (`Parts.ingest`), and the ClickHouse those rows are asked of — a
server over HTTP, or the engine `chdb` embeds in the process (`Clickhouse`).

A row is one part, with the facts the part states of itself as columns — the
trajectory it is of, its kind, its session, its own id and the moment it was
produced — and the part as the exchange encodes it in a `JSON` column, so a
program analyses a trajectory with SQL aggregates rather than by folding over its
parts. The rows of a trajectory are the rows of one `trajectory_id`, since a
trajectory is named by the id it carries rather than by the digest of its bytes.
