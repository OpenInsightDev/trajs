/**
 * How a trajectory's parts are stored: the table they are rows of, the row a
 * part makes, and the write that puts the rows there.
 *
 * Nothing here is published: a program reaches the table through
 * {@link Parts}, which states what the columns are and what writes and reads
 * them. What the table is states the column list, since a `JSON` column's paths
 * are hints of that statement rather than of the row, and what a part states of
 * itself is read to make a row — the kind of part it is, the session it belongs
 * to, its own id and the moment it was produced.
 */

import { Part as partSchema, type EncodingServices } from "@trajs/core/Exchange";
import type * as Trajectory from "@trajs/core/Trajectory";
import { TrajectoryError } from "@trajs/core/TrajectoryError";
import { DateTime, Effect, Match, Schema, Stream } from "effect";
import { SqlError } from "effect/sql/SqlError";

import { Client } from "#/Clickhouse.ts";
import type { Encoded, Row } from "#/Parts.ts";

/** The name of the table the rows are written into. */
export const name = "parts";

/**
 * The paths of a part stated as the columns of their own a query reads.
 *
 * A `JSON` column infers the type of every path it holds, which is what makes a
 * path of a kind of part no schema names readable at all; naming a path states
 * it as a subcolumn of that type in every block instead, so a query over it
 * reads the subcolumn rather than inferring the type again per block. These are
 * the ones a query aggregates over: the model a response was produced by, the
 * tool a call named, and the two totals of what the response used.
 */
const hinted = [
  "`response.modelId` LowCardinality(String)",
  "`response.name` LowCardinality(String)",
  "`response.usage.inputTokens.total` UInt32",
  "`response.usage.outputTokens.total` UInt32",
].join(",\n    ");

/** The statement that creates {@link name}, as ClickHouse is asked for it. */
export const ddl = `CREATE TABLE IF NOT EXISTS ${name} (
    digest String,
    position UInt32,
    tag LowCardinality(String),
    variant LowCardinality(String),
    session_id LowCardinality(String),
    uuid Nullable(UUID),
    time Nullable(DateTime64(3, 'UTC')),
    part JSON(max_dynamic_paths = 64, ${hinted})
  )
  ENGINE = ReplacingMergeTree
  ORDER BY (digest, position)`;

/** The moment `timestamp` states, as ClickHouse reads one, and `null` where it states none. */
const moment = (timestamp: DateTime.Utc | undefined): string | null =>
  timestamp === undefined ? null : DateTime.formatIso(timestamp);

/**
 * What a part states of itself in the columns beside its payload, as the kind
 * of part it is states it.
 *
 * A session part declares the session, so the session it belongs to is its own
 * id; a metric part states no session, so it belongs to none. Every kind of part
 * is stated, so a kind added to a trajectory is a kind this fails to read rather
 * than one it writes as nothing.
 */
const stated = (part: Trajectory.Part<Trajectory.AnyConfig>) =>
  Match.valueTags(part, {
    Prompt: (part) => ({
      tag: "Prompt",
      variant: "",
      session_id: part.sessionId,
      uuid: part.uuid,
      time: moment(part.timestamp),
    }),
    Session: (part) => ({
      tag: "Session",
      variant: "",
      session_id: part.id,
      uuid: part.uuid,
      time: null,
    }),
    Response: (part) => ({
      tag: "Response",
      variant: part.response.type,
      session_id: part.sessionId,
      uuid: part.uuid,
      time: moment(part.timestamp),
    }),
    Event: (part) => ({
      tag: "Event",
      variant: part.event._tag,
      session_id: part.sessionId,
      uuid: part.uuid,
      time: moment(part.timestamp),
    }),
    Metric: (part) => ({
      tag: "Metric",
      variant: part.metric._tag,
      session_id: "",
      uuid: null,
      time: moment(part.timestamp),
    }),
  });

/** The row `part` makes at `position` of the trajectory `digest` names, carrying the payload it was encoded to. */
const rowOf = (
  digest: string,
  position: number,
  part: Trajectory.Part<Trajectory.AnyConfig>,
  encoded: Encoded,
): Row => ({ digest, position, ...stated(part), part: encoded });

/** The parts of a trajectory as the rows of {@link name}, in the order they arrive. */
export const rowsOf =
  (digest: string) =>
  <C extends Trajectory.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<string, C, E, R>,
  ): Stream.Stream<Row, E | TrajectoryError, R | EncodingServices<C>> => {
    const encode = partSchema(trajectory).pipe(Schema.encodeEffect);

    return trajectory.pipe(
      Stream.zipWithIndex,
      Stream.mapEffect(([part, position]) =>
        encode(part).pipe(
          Effect.mapError(TrajectoryError.parse),
          Effect.map((encoded) => rowOf(digest, position, part, encoded)),
        ),
      ),
    );
  };

/**
 * How many rows are written in one insert.
 *
 * ClickHouse wants inserts few and large rather than many and small: every
 * insert is a part of its own before a merge joins it to the others, and a
 * table of many small parts is a table that reads slowly. The batch is the
 * block one insert carries.
 */
const BatchSize = 4_096;

/** How many batches are inserted at a time. */
const Concurrency = 2;

/** The rows written into {@link name} in batches, and how many were sent. */
export const writeRows = <E, R>(
  rows: Stream.Stream<Row, E, R>,
): Effect.Effect<number, E | SqlError, R | Client> =>
  Effect.gen(function* () {
    const ch = yield* Client;

    return yield* rows.pipe(
      Stream.grouped(BatchSize),
      Stream.mapEffect(
        (batch) => ch.insertQuery({ table: name, values: batch }).pipe(Effect.as(batch.length)),
        { concurrency: Concurrency },
      ),
      Stream.runFold(
        () => 0,
        (written: number, count: number) => written + count,
      ),
    );
  });
