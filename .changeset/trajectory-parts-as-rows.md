---
"@trajs/olap": minor
---

A trajectory's parts as the rows an OLAP store aggregates them in: `@trajs/olap`
states the `parts` table (`Parts`), the write that imports an encoded trajectory
under the digest that names it (`Parts.ingest`), and the ClickHouse those rows
are asked of — a server over HTTP, or the engine `chdb` embeds in the process
(`Clickhouse`).

A row is one part, with the facts the part states of itself as columns and the
part as the exchange encodes it in a `JSON` column, so a program analyses a
trajectory with SQL aggregates rather than by folding over its parts.
