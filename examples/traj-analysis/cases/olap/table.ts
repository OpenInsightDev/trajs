import { Exchange } from "@trajs/core";
import { Clickhouse, Parts } from "@trajs/olap";
import { Effect, Stream } from "effect";

import { config, Fixtures, generation } from "./fixture.ts";

export const prepareTable = () =>
  Effect.gen(function* () {
    const ch = yield* Clickhouse.Client;

    yield* Parts.create();
    yield* ch.asCommand(ch.unsafe("TRUNCATE TABLE IF EXISTS parts"));
  });

export const importFixtures = () =>
  Effect.gen(function* () {
    const exchange = yield* Exchange.Exchange;

    yield* Stream.fromArray(
      Array.from(
        { length: generation.trajectories },
        (_, index) => `${Fixtures}/trajectory-${index}.trajs`,
      ),
    ).pipe(
      Stream.mapEffect((id) => exchange.load(config)(id), { concurrency: 8 }),
      Stream.flatMap((loaded) => Parts.rows(loaded.read(config))),
      Parts.write,
    );
  });
