# @trajs/olap

A trajectory read as the rows an OLAP store aggregates it in, and the ClickHouse
those rows are asked of: a server reached over HTTP, or the engine
[`chdb`](https://github.com/chdb-io/chdb-node) runs in the same process.

- `Clickhouse` — the client rows are written and queries are asked through
  (`Clickhouse.Client`, the `ClickhouseClient` of `@effect/sql-clickhouse`),
  stated for a server (`Clickhouse.layer`) or for the engine `chdb` embeds
  (`Clickhouse.layerEmbedded`).
- `Parts` — the `parts` table: one row per part, the columns a query groups by,
  and the part itself as the `JSON` payload the rest is read off.
  `Parts.create` states the table, `Parts.ingest` writes a trajectory under the
  id it carries, and `Parts.Row` is a row.

## Importing what a program kept

A trajectory is imported through the exchange that read it, so what is written
is the parts the `.trajs` file carries rather than anything derived of them:

```ts
import { Clickhouse, Parts } from "@trajs/olap";
import { Exchange } from "@trajs/core/Exchange";
import { Effect } from "effect";

const importSession = (id: string) =>
  Effect.gen(function* () {
    const exchange = yield* Exchange;
    const loaded = yield* exchange.load(id);

    return yield* Parts.ingest(loaded.read(config));
  });

Effect.gen(function* () {
  yield* Parts.create();
  yield* importSession("sessions/01890a5d.trajs");
}).pipe(Effect.provide(Clickhouse.layerEmbedded()), Effect.runPromise);
```

`config` is what the trajectory is read with: the kits its events, metrics and
response tools are read under. A trajectory read with no event kit holds no event
parts, so none of them are written.

The rows of every trajectory are written under the id that trajectory carries, so
the parts of one are the rows of one `trajectory_id` — and a trajectory read off a
file is named by the uuid its load generated, since the bytes state no id of their
own.

## What the table is read for

Every column but the payload is a fact the part states of itself, so a query
groups and filters without reaching into a document; the payload is the part as
the exchange encodes it, with the paths a query reads most stated as subcolumns
of their own — a `JSON` column infers the type of every other path it holds, so a
part of a kit this package has no schema for is still one a query can read.

```sql
SELECT
  session_id,
  countIf(tag = 'Prompt') AS prompts,
  sum(part.`response.usage.inputTokens.total`) AS input
FROM parts
GROUP BY session_id
```

A row's `part` names the response part it was produced as — `text`, `tool-call`,
`finish` — beside the kind of part in `tag`, so the two are read together: tools
by `part.response.name`, tokens by the `response.usage` totals of a `finish`
part.
