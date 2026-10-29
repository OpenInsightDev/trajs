import { expect, it } from "@effect/vitest";
import { Cache, Prompt, Response, Trajectory } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import { Effect, Option, Predicate, Stream } from "effect";

const config = Config.config();

const id = "paris-then-berlin";

const part = Trajectory.parts(config);

/** The tag of each part, in the order a reading returned them. */
const tags = (parts: Iterable<Trajectory.Part<typeof config>>): ReadonlyArray<string> =>
  Array.from(parts, (held) => held._tag);

interface Summary {
  /** How many parts the cache reports after the source ended. */
  readonly length: number;
  /** Parts the source emitted, over both readings. */
  readonly sourceReads: number;
  /** What each reading replayed, in order. */
  readonly firstPass: ReadonlyArray<string>;
  readonly secondPass: ReadonlyArray<string>;
  /** The reply `at(3)` returned, and whether `at(4)` holds a part at all. */
  readonly fourth: string | undefined;
  readonly pastTheEnd: boolean;
  /** What a second trajectory under the same id emitted, and what it came back with. */
  readonly reusedSourceReads: number;
  readonly reusedLength: number;
}

const main = Effect.fn(function* () {
  const cache = yield* Cache.Cache;

  let sourceReads = 0;

  const source = Stream.fromArray([
    part.prompt(Prompt.make("What is the weather in Paris?")),
    part.response(Response.makePart("text", { text: "It is sunny." })),
    part.prompt(Prompt.make("And in Berlin?")),
    part.response(Response.makePart("text", { text: "It is raining." })),
  ]).pipe(Stream.tap(() => Effect.sync(() => void (sourceReads += 1))));

  // The source is drained here, once, before the cache returns.
  const cached = yield* cache.cache(Trajectory.make(id, config)(source));

  // Both readings replay the kept parts; the source is not pulled again for the second.
  const firstPass = yield* cached.pipe(Stream.runCollect, Effect.map(tags));
  const secondPass = yield* cached.pipe(Stream.runCollect, Effect.map(tags));

  // `at` reads one part by index instead of replaying the stream; past the end is none.
  const fourth = yield* cached.at(3);
  const past = yield* cached.at(4);

  // A second trajectory under the same id is not read: the pool answers with the first.
  let reusedSourceReads = 0;

  const question = Stream.fromArray([part.prompt(Prompt.make("And tomorrow?"))]).pipe(
    Stream.tap(() => Effect.sync(() => void (reusedSourceReads += 1))),
  );

  const reused = yield* cache.cache(Trajectory.make(id, config)(question));

  return {
    length: cached.length,
    sourceReads,
    firstPass,
    secondPass,
    fourth: Option.match(fourth, {
      onNone: () => undefined,
      onSome: (held) =>
        Predicate.isTagged(held, "Response") && held.response.type === "text"
          ? held.response.text
          : undefined,
    }),
    pastTheEnd: Option.isNone(past),
    reusedSourceReads,
    reusedLength: reused.length,
  };
});

it.effect("main", () =>
  main().pipe(
    Effect.map((summary) =>
      expect(summary).toEqual({
        length: 4,
        sourceReads: 4,
        firstPass: ["Prompt", "Response", "Prompt", "Response"],
        secondPass: ["Prompt", "Response", "Prompt", "Response"],
        fourth: "It is raining.",
        pastTheEnd: true,
        reusedSourceReads: 0,
        reusedLength: 4,
      } satisfies Summary),
    ),
    // The window holds the newest 2 parts in memory; the 2 before them go to the store.
    Effect.provide(Cache.layer({ capacity: 2 })),
  ),
);
