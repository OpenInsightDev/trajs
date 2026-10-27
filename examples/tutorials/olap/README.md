# Asking a trajectory as SQL

Reading trajectories one at a time stops being cheap when there are hundreds of
them. `@trajs/olap` writes each part as a row of a ClickHouse table, so a
question over many runs is one query instead of a fold per run.

```ts
const main = Effect.gen(function* () {
  yield* Parts.create(); // CREATE TABLE IF NOT EXISTS
  const written = yield* Parts.ingest(trajectory); // rows for one run

  const ch = yield* Clickhouse.Client;
  const [counted] = yield* ch<{ rows: number }>`
    SELECT toUInt32(count()) AS rows
    FROM parts
    WHERE trajectory_id = ${trajectory.id}
  `;
});
```

A row is one part. The facts a query groups and filters on are columns on the
row — `trajectory_id`, `session_id`, `tag`, `variant`, `uuid`, `time`,
`position` — and the part itself is the `part` JSON payload, so a call's tool is
``part.`response.name` `` and a finish part's bill is
``part.`response.usage.inputTokens.total` ``. ClickHouse reads those paths as
subcolumns, so nothing is parsed to filter on them.

`Clickhouse.layerEmbedded()` runs the engine `chdb` loads in the process: no
server, no data leaving the machine. `Clickhouse.layer({ url, ... })` is the
same client against a server. Statements are built with the client's template
literals, which send interpolated values as parameters rather than splicing them
into the SQL.

`Parts.ingest` writes a trajectory under the id it carries. The table is a
`ReplacingMergeTree` keyed by that id and the part's position, so importing the
same trajectory twice replaces its rows instead of keeping two of each; the
replace happens when ClickHouse merges, so a count that imports twice is
deduplicated with `FINAL` or by aggregating on the key. Every trajectory written
to the table stays there, which is what makes cross-run questions possible and
why a query over one run filters by its id. A part the reading did not produce
is not a row: a trajectory read without an event kit holds no events to write.
`Parts.ddl` and `Parts.name` are there for a program that states the table
itself.

The table here holds two short runs, `tutorial-run-1` and `tutorial-run-2`. Six
rows each, twelve in all. The two queries group them into four calls over three
tools (`bash` 2, `grep` 1, `read_file` 1) and 300 / 170 input tokens with 75 /
35 output tokens for the two runs.

```sh
vp test olap
```
