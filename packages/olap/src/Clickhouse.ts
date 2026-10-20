/**
 * The ClickHouse a trajectory's rows are written to and asked of: a server a
 * program reaches over HTTP, or the engine `chdb` runs inside the process.
 *
 * **When to use**
 *
 * Use to state where {@link Parts} writes and what a query over it reads.
 *
 * **Details**
 *
 * Both are one {@link Client} — the SQL client `@effect/sql-clickhouse` states
 * over `@clickhouse/client` — so a program writes and reads the same effect
 * either way, and the SQL it writes is [ClickHouse's own][docs]. {@link layer}
 * reaches a server at the URL it is given, and {@link layerEmbedded} runs the
 * engine `chdb` embeds, which needs no server: `chdb` states a connection
 * `@clickhouse/client` runs every method through, so the client, its SQL
 * templates and its typed parameters are the ones a program on a server uses.
 *
 * The embedded engine is one per process: every {@link layerEmbedded} in a
 * program reaches the same in-memory database, so two of them see each other's
 * tables.
 *
 * [docs]: https://clickhouse.com/docs
 */

import { ClickhouseClient as EffectClickhouse } from "@effect/sql-clickhouse";
import type { ClickhouseClientConfig } from "@effect/sql-clickhouse/ClickhouseClient";
import { Effect, Layer } from "effect";

/**
 * The ClickHouse SQL client a program writes and reads through: the
 * `ClickhouseClient` of `@effect/sql-clickhouse`, beside the `SqlClient` every
 * SQL package of `effect` states.
 *
 * **When to use**
 *
 * Use to require the client of an effect that writes or queries, and to build a
 * SQL statement with the templates and typed parameters it carries.
 *
 * @see {@link layer} for the client of a server, and {@link layerEmbedded} for
 * the client of the engine in this process.
 * @category services
 */
export const Client = EffectClickhouse.ClickhouseClient;

/** The type of {@link Client}. */
export type Client = EffectClickhouse.ClickhouseClient;

/**
 * The client of the ClickHouse server at `config`.
 *
 * **When to use**
 *
 * Use to write and query a server a program reaches over HTTP, such as the one
 * `docker run clickhouse/clickhouse-server` starts.
 *
 * **Details**
 *
 * `config` is the configuration of `@clickhouse/client` — `url`, `database`,
 * `username` and `password`, the `clickhouse_settings` every statement is sent
 * with, and so on — and the layer pings the server once, so a server that is
 * not there fails when the layer is built rather than on the first query.
 *
 * @see {@link layerEmbedded} for the engine a program needs no server for.
 * @category layers
 */
export const layer = EffectClickhouse.layer;

/**
 * What the embedded engine a program runs is opened as.
 *
 * @see {@link layerEmbedded} for the layer these are stated for.
 * @category models
 */
export interface EmbeddedOptions {
  /**
   * The directory `chdb` keeps its data in, or `":memory:"` for a database
   * that lives no longer than the process does.
   *
   * @default ":memory:"
   */
  readonly path?: string;
}

/**
 * The client of the ClickHouse engine `chdb` embeds in the process: a server a
 * program runs without one.
 *
 * **When to use**
 *
 * Use to write and query trajectories in a program that keeps no ClickHouse of
 * its own — a test, a script, or an agent that analyses what it just produced.
 *
 * **Details**
 *
 * `chdb` is a native addon, so it is imported when the layer is built rather
 * than when this module is: a program that reaches a server never loads it. The
 * engine it opens is one per process, and two layers on `":memory:"` see the
 * same tables. Its prebuilt engines are for macOS and Linux, so a program on
 * any other platform reaches a server instead ({@link layer}).
 *
 * @see {@link layer} for the client of a server.
 * @see https://github.com/chdb-io/chdb-node for the engine this runs.
 * @category layers
 */
export const layerEmbedded = (options: EmbeddedOptions = {}) =>
  Effect.promise(() => import("chdb/connection")).pipe(
    Effect.map(({ createChdbConnection }) => {
      // SAFETY: chDB states its connection in the contract
      // `@clickhouse/client-common` publishes, and `@clickhouse/client` bundles a
      // copy of that contract of its own since 1.24. The two state the same contract,
      // so what the client is handed is the connection as the client reads it.
      const connection = createChdbConnection(options) as NonNullable<
        ClickhouseClientConfig["connection"]
      >;

      return EffectClickhouse.layer({ connection });
    }),
    Layer.unwrap,
  );
