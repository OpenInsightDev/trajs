import { expect, it } from "vite-plus/test";
import { Context, Effect, Equal, Schema } from "effect";
import * as Extension from "#/Extension.ts";

class Tokenizer extends Context.Service<
  Tokenizer,
  {
    readonly count: (text: string) => Effect.Effect<number>;
  }
>()("Tokenizer") {}

class Tracer extends Context.Service<
  Tracer,
  {
    readonly span: () => number;
  }
>()("Tracer") {}

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

const counted = Effect.gen(function* () {
  const tokenizer = yield* Tokenizer;

  return yield* tokenizer.count("Hello");
});

it("declares the services a producer of the data needs", async () => {
  const declared: Effect.Effect<number, never, Extension.Requirements<typeof estimate>> = counted;

  const tokens = await Effect.runPromise(
    Effect.provideService(declared, Tokenizer, { count: () => Effect.succeed(1) }),
  );

  expect(tokens).toBe(1);
});

it("lets an extension that needs nothing stand for one that needs a service", () => {
  const widened: Extension.Extension<typeof otel.id, typeof otel.version, Tokenizer> = otel;

  expect(widened.id).toBe(otel.id);
});

it("adds a service to the requirements without changing the extension", async () => {
  const traced = estimate.addDependency(Tracer);

  const both: Effect.Effect<number, never, Extension.Requirements<typeof traced>> = Effect.gen(
    function* () {
      const tokenizer = yield* Tokenizer;
      const tracer = yield* Tracer;

      return (yield* tokenizer.count("Hello")) + tracer.span();
    },
  );

  const total = await Effect.runPromise(
    both.pipe(
      Effect.provideService(Tokenizer, { count: () => Effect.succeed(2) }),
      Effect.provideService(Tracer, { span: () => 3 }),
    ),
  );

  expect(total).toBe(5);
  expect(Equal.equals(traced, estimate)).toBe(true);
});

it("carries the requirements into a derived version", async () => {
  const timed = estimate.pipe(
    Extension.upgrade(
      (fields) => ({
        ...fields,
        version: Schema.Literal("0.2.0"),
        mediaTokens: Schema.optional(Schema.Number),
      }),
      { decode: (from) => ({ ...from, version: "0.2.0" }) },
    ),
  );

  const declared: Effect.Effect<number, never, Extension.Requirements<typeof timed>> = counted;

  const tokens = await Effect.runPromise(
    Effect.provideService(declared, Tokenizer, { count: () => Effect.succeed(4) }),
  );

  expect(Schema.decodeUnknownSync(timed.version)({ version: "0.1.0", tokens: 3 })).toEqual({
    version: "0.2.0",
    tokens: 3,
  });
  expect(tokens).toBe(4);
});
