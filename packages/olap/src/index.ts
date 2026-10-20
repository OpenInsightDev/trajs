/**
 * Trajectories read as the rows an OLAP store aggregates them in, and the
 * ClickHouse they are asked of.
 *
 * Every module is re-exported as a namespace — `Parts.ingest`, `Clickhouse.layer`
 * — and each is also available as a subpath import such as `@trajs/olap/Parts`.
 */

export * as Clickhouse from "#/Clickhouse.ts";

export * as Parts from "#/Parts.ts";
