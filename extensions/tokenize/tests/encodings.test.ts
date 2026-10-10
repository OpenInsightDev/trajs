import { expect, it } from "vite-plus/test";
import { Effect, Layer } from "effect";
import { Tokenizer } from "#/Tokenizer.ts";

/** Runs a program against a tokenizer built from one shipped encoding. */
const run = <A, E>(
  program: Effect.Effect<A, E, Tokenizer>,
  layer: Layer.Layer<Tokenizer>,
): Promise<A> => Effect.runPromise(program.pipe(Effect.provide(layer)));

it("lists the encodings it ships", () => {
  expect(Tokenizer.encodingNames).toEqual(["cl100k_base", "o200k_base", "p50k_base", "claude"]);
});

it("tokenizes with an encoding it ships", async () => {
  const encoded = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        name: tokenizer.encodingName,
        hello: yield* tokenizer.encode("hello"),
        helloWorld: yield* tokenizer.encode("hello world"),
        marker: yield* tokenizer.encode("<|endoftext|>", {
          allowedSpecial: ["<|endoftext|>"],
        }),
      };
    }),
    Tokenizer.layer("cl100k_base"),
  );

  // Token identifiers of `cl100k_base` itself, so a mistake in reading its rank
  // source shows up here rather than in a shape that merely looks plausible.
  expect(encoded.name).toBe("cl100k_base");
  expect(encoded.hello).toEqual([15339]);
  expect(encoded.helloWorld).toEqual([15339, 1917]);
  expect(encoded.marker).toEqual([100257]);
});

it("round-trips text through every encoding it ships", async () => {
  const texts = ["", "Hello, world!", "你好世界 🌍", "function test() { return 42; }", "a\n\tb"];

  for (const name of Tokenizer.encodingNames) {
    const decoded = await run(
      Effect.gen(function* () {
        const tokenizer = yield* Tokenizer;

        return yield* Effect.forEach(texts, (text) =>
          Effect.gen(function* () {
            const tokens = yield* tokenizer.encode(text);

            return yield* tokenizer.decode(tokens);
          }),
        );
      }),
      Tokenizer.layer(name),
    );

    expect(decoded).toEqual(texts);
  }
});

it("reads a marker that occupies the first ranks", async () => {
  const read = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        tokens: yield* tokenizer.encode("<EOT>", { allowedSpecial: ["<EOT>"] }),
        text: yield* tokenizer.decode([0, 4]),
      };
    }),
    Tokenizer.layer("claude"),
  );

  expect(read.tokens).toEqual([0]);
  expect(read.text).toBe("<EOT><SOS>");
});
