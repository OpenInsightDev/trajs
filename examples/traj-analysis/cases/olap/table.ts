/**
 * The parts table of the example: what it is prepared as, and how a fixture set is
 * imported into it.
 *
 * The trajectories of a set are imported into one stream rather than one at a time,
 * so that the rows of a whole set are written in blocks rather than in a part of
 * their own per file — which is what makes an import of hundreds of trajectories an
 * import of a few blocks. A single trajectory is `Parts.ingest(trajectory)`.
 */

import { Exchange } from "@trajs/core";
import { Clickhouse, Parts } from "@trajs/olap";
import { Effect, Stream } from "effect";

import { config, Fixtures, generation } from "./fixture.ts";

/**
 * Creates the table the rows are written into — unless it is already there — and
 * empties it, so that what it holds is the fixture set of this run rather than the
 * rows of a reading before it.
 */
export const prepareTable = () =>
  Effect.gen(function* () {
    const ch = yield* Clickhouse.Client;

    yield* Parts.create();
    yield* ch.asCommand(ch.unsafe("TRUNCATE TABLE IF EXISTS parts"));
  });

/** Reads every fixture of the set back and imports it into the table. */
export const importFixtures = () =>
  Effect.gen(function* () {
    const exchange = yield* Exchange.Exchange;

    yield* Stream.fromArray(
      Array.from(
        { length: generation.trajectories },
        (_, index) => `${Fixtures}/trajectory-${index}.trajs`,
      ),
    ).pipe(
      Stream.mapEffect((id) => exchange.load(id), { concurrency: 8 }),
      Stream.flatMap((loaded) => Parts.rows(loaded.read(config))),
      Parts.write,
    );
  });
