/**
 * The table a trajectory's parts are stored in, and the write that puts them
 * there: one row per part, the columns a query groups by, and the encoded part
 * as the JSON the rest is read off.
 *
 * **When to use**
 *
 * Use to state the table a program analyses trajectories in ({@link create}),
 * to write a trajectory that was read into it ({@link ingest}), and to read the
 * rows back as the rows they are ({@link Row}).
 *
 * **Details**
 *
 * A trajectory is a stream of parts in one total order, so a row is one part in
 * that order, and the trajectory it was read from is the id it carries. What every
 * part states of itself is a column of its own — the kind of part and what it is
 * of that kind, the session it belongs to, the part's own id and the moment it was
 * produced — so a query groups and filters without reaching into a payload. A
 * session is not the trajectory that declares it: one trajectory can hold several
 * sessions — the session of the run itself, and the sessions of the agents it
 * starts — so `trajectory_id` and `session_id` group the same rows two ways.
 *
 * What a part is of its kind is the payload the rest is read off
 * ({@link Row.part}): the part as JSON states it, where the bytes of a media part
 * are a base64 string rather than an object of a key per byte, typed on the paths
 * a query aggregates over — `response.modelId`, `response.name` and the two
 * totals of `response.usage` — and dynamic everywhere else, since a part of a kit
 * a program does not know the schema of is still one a query can read. The table
 * is a `MergeTree` as ClickHouse's semi-structured data wants it: a `JSON` column
 * stores the paths that are typed separately from the ones that are not, so
 * reading one is reading a subcolumn rather than parsing a document.
 *
 * The rows of a trajectory are replaced rather than duplicated when the trajectory
 * of the same id is written twice, and no row is written for a part a reading did
 * not name: a trajectory read without an event kit holds no event parts.
 */

import * as Config from "@trajs/core/Config";
import type * as Trajectory from "@trajs/core/Trajectory";
import { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect, Schema } from "effect";
import { SqlError } from "effect/sql/SqlError";

import { Client } from "#/Clickhouse.ts";
import { ddl as statement, name as table, rowsOf, writeRows } from "#/internal/parts.ts";

/**
 * The name of the table the rows are written into.
 *
 * @category constants
 */
export const name = table;

/**
 * The statement that creates {@link name}, as ClickHouse is asked for it.
 *
 * **When to use**
 *
 * Use where a program states its own schema — a migration of its own, or a
 * table partitioned or ordered differently — rather than through {@link create}.
 *
 * **Details**
 *
 * It creates the table only where it is not there, so it is safe to state on
 * every run. The engine is a `ReplacingMergeTree` keyed by the trajectory and the
 * part's position in it, so writing a trajectory twice keeps one row per part
 * rather than two: replacing happens when ClickHouse merges the parts of the
 * table, so a count is deduplicated by `FINAL` or by a query that aggregates by
 * the key.
 *
 * The payload states up to 64 paths as subcolumns of their own, which is what a
 * query over one reads; a path past that limit is kept in the column's shared
 * data instead, so it is read more slowly rather than lost.
 *
 * @see {@link create} for running it.
 * @category constants
 */
export const ddl = statement;

/**
 * A part as JSON states it: the `part` column's payload.
 *
 * **When to use**
 *
 * Use to type what a query reads out of the payload column.
 *
 * **Details**
 *
 * It is the encoded form of the parts a trajectory is stored as — the parts
 * `@trajs/core`'s `Exchange.Part` writes into a `.trajs` file — in the canonical
 * JSON form of the same schema: a response part's response is the schema of its
 * own state rather than the toolkit it was produced with, and a value JSON has no
 * form of is the string JSON states it as. The bytes of a media part are a base64
 * string, which is one path of a `JSON` column rather than a path per byte; a
 * moment is an ISO 8601 string; and a field the part does not state is `null`. A
 * value of the part's schema that is `unknown` — a param of a tool no toolkit
 * declares, say — is written as it is, so a part carrying one that is not JSON
 * fails to encode rather than writing a payload no `JSON` column can hold.
 *
 * @category models
 */
export type Encoded = Schema.JsonObject;

/**
 * A part of a trajectory as a row of {@link name}.
 *
 * **When to use**
 *
 * Use to type what a query reads back, or what {@link write} is given.
 *
 * **Details**
 *
 * The fields are named as the columns are, so a row is written without a column
 * list. `trajectory_id` is the id the trajectory the part was read from carries,
 * `position` is where the part is in the one order a trajectory carries its parts
 * in, and `session_id` is the session the part belongs to: the id a session part
 * declares, the main session for a part that states none of its own, and `""` for a
 * metric part, which states no session.
 *
 * @category models
 */
export interface Row {
  /** The trajectory the part was read from, as the id that trajectory carries. */
  readonly trajectory_id: string;

  /** Where the part is in the one order that trajectory carries its parts in, counting from zero. */
  readonly position: number;

  /** The kind of part: `Prompt`, `Session`, `Response`, `Event` or `Metric`. */
  readonly tag: string;

  /**
   * What the part is of its kind, and `""` where it is not of one: a response
   * part's `type` (`text`, `tool-call`, `finish`, ...), the tag an event or a
   * metric was produced under, and nothing a prompt or a session part is of.
   */
  readonly variant: string;

  /**
   * The session the part belongs to: the main session where it states none of its own,
   * and `""` for a metric part, which states none.
   */
  readonly session_id: string;

  /** The part's own id, and `null` for a metric part, which states none. */
  readonly uuid: string | null;

  /** When the part was produced, as an ISO 8601 moment, and `null` where it states none. */
  readonly time: string | null;

  /** The part as JSON states it, which is what the rest of a query reads. */
  readonly part: Encoded;
}

/**
 * Creates {@link name} through the ClickHouse client, saying nothing where it
 * is already there.
 *
 * **When to use**
 *
 * Use before the first {@link ingest} of a program, or in a migration that
 * states no table of its own.
 *
 * @see {@link ddl} for the statement it runs.
 * @category constructors
 */
export const create = (): Effect.Effect<void, SqlError, Client> =>
  Effect.gen(function* () {
    const ch = yield* Client;

    // A `CREATE` takes no parameters, so the statement is run as it is written.
    yield* ch.asCommand(ch.unsafe(ddl));
  });

/**
 * The parts of `trajectory` as the rows of {@link name}, in the order they
 * arrive.
 *
 * **When to use**
 *
 * Use to see what {@link ingest} would write — how many rows a trajectory is,
 * and what they state — or to write the rows another way than {@link write}
 * does.
 *
 * **Details**
 *
 * Every row states the id `trajectory` carries ({@link Row.trajectory_id}), so a
 * whole trajectory is the rows of one `trajectory_id`.
 *
 * Each part is stated as its canonical JSON form before it is a row, so what the
 * payload column carries is the part as a trajectory states it rather than as the
 * toolkit it was produced with does: a tool result travels as its encoded form,
 * not as the decoded one, and the bytes of a media part are the base64 string
 * JSON states them as ({@link Encoded}). Encoding is what a toolkit states of its
 * own tools' results, so the stream takes {@link Config.EncodingServices} beside
 * the services the trajectory is read with.
 *
 * @see {@link ingest} for writing the rows this stream makes.
 * @category constructors
 */
export const rows = rowsOf;

/**
 * Writes `rows` into {@link name} in batches, saying how many were sent.
 *
 * **When to use**
 *
 * Use to write the rows a program derived its own way; {@link ingest} does this
 * over a trajectory.
 *
 * **Details**
 *
 * A batch is one insert of up to 4096 rows, and two batches are inserted at a
 * time. The count is what was sent rather than what the server kept: rows of the
 * same `trajectory_id` and `position` are replaced by the next write of them
 * rather than added to them ({@link ddl}).
 *
 * @see {@link create} for the table it writes into.
 * @category destructors
 */
export const write = writeRows;

/**
 * Writes `trajectory` into {@link name}, saying how many rows it became.
 *
 * **When to use**
 *
 * Use to import a trajectory a program read through an `Exchange` — an encoded
 * stream of parts rather than a trajectory built in memory — or one it produced
 * and wants to analyse beside the ones it kept.
 *
 * **Details**
 *
 * The rows are written under the id `trajectory` carries, and that id is what a
 * query joins the parts of one trajectory on: a trajectory a program builds is
 * named by the id it was made with ({@link Trajectory.make}), and one read off a
 * `.trajs` file is named by the uuid the load generated, since the bytes state no
 * id of their own. Two trajectories of the same id are one trajectory to the
 * table, so importing the same id twice replaces its rows rather than adding to
 * them ({@link ddl}); importing the same file twice is two ids, and so two
 * trajectories. What is written is {@link rows} batched by {@link write}, so the
 * table must be there already ({@link create}).
 *
 * **Example** (Importing a trajectory a program kept)
 *
 * ```ts
 * import { Exchange } from "@trajs/core/Exchange"
 * import { Parts } from "@trajs/olap"
 * import { Effect } from "effect"
 *
 * const importTrajectory = (id: string, config: Config.AnyConfig) =>
 *   Effect.gen(function*() {
 *     const exchange = yield* Exchange
 *     const loaded = yield* exchange.load(id)
 *
 *     return yield* Parts.ingest(loaded.read(config))
 *   })
 * ```
 *
 * @see {@link create} for the table it writes into.
 * @category destructors
 */
export const ingest = <C extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, C, E, R>,
): Effect.Effect<number, E | TrajectoryError | SqlError, R | Config.EncodingServices<C> | Client> =>
  rows(trajectory).pipe(write);
