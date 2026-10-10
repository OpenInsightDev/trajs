import { expect, it } from "vite-plus/test";
import { Context, Effect, Schema, Stream } from "effect";
import { Prompt } from "effect/ai";
import * as Extension from "#/Extension.ts";
import * as Extensionkit from "#/Extensionkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

class Tokenizer extends Context.Service<
  Tokenizer,
  {
    readonly count: (text: string) => Effect.Effect<number>;
  }
>()("Tokenizer") {}

const estimate = Extension.make(
  "org.js.tra.tokenize",
  Extension.Metadata.make({ name: "Token estimate" }),
  Extension.Versions.make(
    Schema.Struct({ version: Schema.Literal("0.1.0"), tokens: Schema.Number }),
  ),
  { dependencies: [Tokenizer] },
);

const otel = Extension.make(
  "dev.observerw.otel",
  Extension.Metadata.make({ name: "OpenTelemetry" }),
  Extension.Versions.make(
    Schema.Struct({ version: Schema.Literal("1.0.0"), spanId: Schema.String }),
  ),
);

const otelKit = Extensionkit.make(otel);

const estimateKit = Extensionkit.make(estimate);

/** A span for one part, anchored to it. */
const spanOf = (uuid: string): Extension.ProducerOutput<typeof otel> => ({
  data: { version: "1.0.0", spanId: uuid },
  attach: [uuid],
});

/** What one part is worth, anchored to it. */
const estimateOf = (uuid: string, tokens: number): Extension.ProducerOutput<typeof estimate> => ({
  data: { version: "0.1.0", tokens },
  attach: [uuid],
});

const span: Extension.Producer<typeof otel> = (messages) =>
  Stream.map(messages, (part) => spanOf(part.uuid));

const counted: Extension.Producer<typeof estimate> = (messages) =>
  messages.pipe(
    Stream.mapEffect((part) =>
      Effect.gen(function* () {
        const tokenizer = yield* Tokenizer;

        return estimateOf(part.uuid, yield* tokenizer.count(part.uuid));
      }),
    ),
  );

/** What a whole recording is worth, written once it has been read. */
const total: Extension.Producer<typeof estimate> = (messages) =>
  Stream.fromEffect(
    Effect.map(Stream.runCollect(messages), (parts) => ({
      data: { version: "0.1.0", tokens: parts.length },
    })),
  );

const part = Trajectory.promptPart(Prompt.make("Hello"));

const recorded = Trajectory.make(Stream.make(part));

const messages = Trajectory.messages(recorded);

class CountingFailed extends Schema.TaggedError<CountingFailed>()("CountingFailed", {}) {}

const failed: Extension.Producer<typeof estimate, CountingFailed> = (messages) =>
  messages.pipe(Stream.mapEffect(() => Effect.fail(new CountingFailed())));

it("pairs every extension of a set with the producer that writes its data", async () => {
  const produced = Extensionkit.withProducers(Extensionkit.make(otel, estimate))({
    "dev.observerw.otel": span,
    "org.js.tra.tokenize": counted,
  });

  expect(Object.keys(produced)).toEqual(["dev.observerw.otel", "org.js.tra.tokenize"]);

  // The extension of a pair is the one the set was collected with, so the set
  // reads and writes the data it did.
  expect(produced["dev.observerw.otel"].extension).toBe(otel);

  const written = Array.from(
    await Effect.runPromise(Stream.runCollect(produced["dev.observerw.otel"].producer(messages))),
  );

  expect(written).toEqual([{ data: { version: "1.0.0", spanId: part.uuid }, attach: [part.uuid] }]);
});

it("keeps the producers as they are typed", async () => {
  const produced = Extensionkit.withProducers(estimateKit)({
    "org.js.tra.tokenize": counted,
  });

  const written: Stream.Stream<
    Extension.ProducerOutput<typeof estimate>,
    TrajectoryError,
    Tokenizer
  > = produced["org.js.tra.tokenize"].producer(messages);

  const tokens = await Effect.runPromise(
    Stream.runCollect(
      written.pipe(Stream.provideService(Tokenizer, { count: () => Effect.succeed(3) })),
    ),
  );

  expect(Array.from(tokens)).toEqual([
    { data: { version: "0.1.0", tokens: 3 }, attach: [part.uuid] },
  ]);
});

it("carries the failures a producer raises beside the ones a recording reports", async () => {
  const produced = Extensionkit.withProducers(estimateKit)({
    "org.js.tra.tokenize": failed,
  });

  const written: Stream.Stream<
    Extension.ProducerOutput<typeof estimate>,
    CountingFailed | TrajectoryError,
    Tokenizer
  > = produced["org.js.tra.tokenize"].producer(messages);

  const failure = await Effect.runPromise(
    Effect.flip(
      Stream.runCollect(
        written.pipe(Stream.provideService(Tokenizer, { count: () => Effect.succeed(1) })),
      ),
    ),
  );

  expect(failure).toBeInstanceOf(CountingFailed);
});

it("writes a datum about the recording rather than about one of its parts", async () => {
  const produced = Extensionkit.withProducers(estimateKit)({
    "org.js.tra.tokenize": total,
  });

  const written = Array.from(
    await Effect.runPromise(
      Stream.runCollect(
        produced["org.js.tra.tokenize"]
          .producer(messages)
          .pipe(Stream.provideService(Tokenizer, { count: () => Effect.succeed(0) })),
      ),
    ),
  );

  expect(written).toEqual([{ data: { version: "0.1.0", tokens: 1 } }]);
});

it("rejects producers that do not match the set", () => {
  // What a set takes is checked where the set is built, so the shapes below do not
  // compile: a producer that is missing, one under an identifier the set does not
  // hold — alone or beside the ones it does — one written for another extension's
  // data, and one that takes a service its extension does not declare. The calls are
  // never made: what they check is that they are rejected, and nothing about a set is
  // checked at runtime.
  const rejected = () => {
    const stranger = { "dev.observerw.otel": span, "dev.observerw.other": span };

    // @ts-expect-error a producer is required for every extension of the set
    Extensionkit.withProducers(otelKit)({});
    // @ts-expect-error no extension of the set has that identifier
    Extensionkit.withProducers(otelKit)({ "dev.observerw.other": span });
    // @ts-expect-error no extension of the set has that identifier
    Extensionkit.withProducers(otelKit)(stranger);
    // @ts-expect-error the producer writes another extension's data
    Extensionkit.withProducers(otelKit)({ "dev.observerw.otel": counted });
    // @ts-expect-error the producer takes a service the extension does not declare
    Extensionkit.withProducers(estimateKit)({ "org.js.tra.tokenize": span });
  };

  expect(rejected).toBeTypeOf("function");
});
