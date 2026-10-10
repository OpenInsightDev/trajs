import { expect, it } from "vite-plus/test";
import { Effect, Layer } from "effect";
import { DisallowedSpecialToken, Tokenizer, type TokenizerOptions } from "#/Tokenizer.ts";
import { sample } from "./sample.ts";

/** The tokenizer the tests encode and decode with unless a test builds its own. */
const sampleLayer = Tokenizer.layerFromEncoding(sample());

/** Runs a program that needs a tokenizer, providing one built for the test. */
const run = <A, E>(
  program: Effect.Effect<A, E, Tokenizer>,
  layer: Layer.Layer<Tokenizer> = sampleLayer,
): Promise<A> => Effect.runPromise(program.pipe(Effect.provide(layer)));

/**
 * Texts full of pieces no merge covers, so a small merge cache evicts
 * constantly and repeated pieces still hit it.
 */
const sampleTexts = (count: number): ReadonlyArray<string> => {
  let seed = 42;

  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;

    return seed >>> 8;
  };

  const pick = (alphabet: string, length: number) => {
    let text = "";

    for (let at = 0; at < length; at++) text += alphabet[next() % alphabet.length];

    return text;
  };

  const hex = "0123456789abcdef";
  const texts: Array<string> = [];

  for (let at = 0; at < count; at++) {
    const repeated = texts.length === 0 ? "" : texts[next() % texts.length].slice(0, 20);

    texts.push(
      `id ${pick(hex, 8)}-${pick(hex, 4)} n=${pick("0123456789", 30)} ${pick("ca ll ab", 24)} ${repeated}`,
    );
  }

  return texts;
};

it("encodes text into the tokens of its pieces", async () => {
  const encoded = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        call: yield* tokenizer.encode("call"),
        hello: yield* tokenizer.encode("hello"),
        ab: yield* tokenizer.encode("ab"),
        spaced: yield* tokenizer.encode("a b"),
      };
    }),
  );

  expect(encoded.call).toEqual([257, 256]);
  expect(encoded.hello).toEqual([104, 101, 256, 111]);
  expect(encoded.ab).toEqual([258]);
  expect(encoded.spaced).toEqual([97, 32, 98]);
});

it("decodes a text back from the tokens it encodes to", async () => {
  const texts = [
    "",
    "a",
    "call",
    "hello world",
    "€",
    "你好世界",
    "Hello, world!",
    "a\n\tb",
    "<|fim|>",
  ];

  const decoded = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* Effect.forEach(texts, (text) =>
        Effect.gen(function* () {
          const tokens = yield* tokenizer.encode(text, { allowedSpecial: "all" });

          return yield* tokenizer.decode(tokens);
        }),
      );
    }),
  );

  expect(decoded).toEqual(texts);
});

it("decodes tokens no table holds as nothing", async () => {
  const text = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* tokenizer.decode([999999, 104, 999999, 105]);
    }),
  );

  expect(text).toBe("hi");
});

it("names the encoding it was built from", async () => {
  const name = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return tokenizer.encodingName;
    }),
  );

  expect(name).toBe("sample");
});

it("counts the tokens a text encodes to", async () => {
  const counts = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        call: yield* tokenizer.count("call"),
        markers: yield* tokenizer.count("<|endoftext|>hi", {
          allowedSpecial: ["<|endoftext|>"],
        }),
        empty: yield* tokenizer.count(""),
      };
    }),
  );

  expect(counts.call).toBe(2);
  expect(counts.markers).toBe(3);
  expect(counts.empty).toBe(0);
});

it("reads a declared special token when the call allows it", async () => {
  const encoded = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        allowed: yield* tokenizer.encode("<|endoftext|>hi", {
          allowedSpecial: ["<|endoftext|>"],
        }),
        all: yield* tokenizer.encode("<|endoftext|>hi", { allowedSpecial: "all" }),
        decoded: yield* tokenizer.decode([300, 301]),
      };
    }),
  );

  expect(encoded.allowed).toEqual([300, 104, 105]);
  expect(encoded.all).toEqual([
    60, 124, 101, 110, 100, 111, 102, 116, 101, 120, 116, 124, 62, 104, 105,
  ]);
  expect(encoded.decoded).toBe("<|endoftext|><|fim|>");
});

it("fails on a special token the call does not allow", async () => {
  const failure = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* Effect.flip(tokenizer.encode("a<|fim|>b"));
    }),
  );

  expect(failure).toBeInstanceOf(DisallowedSpecialToken);
  expect(failure.token).toBe("<|fim|>");
  expect(failure.message).toBe("Text contains disallowed special token: <|fim|>");
});

it("reads only the special tokens the call selects", async () => {
  const encoded = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        fim: yield* tokenizer.encode("<|fim|>x", { allowedSpecial: ["<|fim|>"] }),
        // `zz` starts inside the longer `zzz`, which the call does not allow, so a
        // match is advanced one character at a time until the allowed one begins.
        overlap: yield* tokenizer.encode("zzz", {
          allowedSpecial: ["zz"],
          disallowedSpecial: [],
        }),
      };
    }),
  );

  expect(encoded.fim).toEqual([301, 120]);
  expect(encoded.overlap).toEqual([122, 304]);
});

it("reads special tokens added beside the declared ones", async () => {
  const options: TokenizerOptions = { specialTokens: { "<|custom|>": 400 } };
  const custom = Tokenizer.layerFromEncoding(sample(), options);

  const encoded = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* tokenizer.encode("<|custom|>a", { allowedSpecial: ["<|custom|>"] });
    }),
    custom,
  );

  expect(encoded).toEqual([400, 97]);
});

it("encodes the same tokens whatever the merge cache holds", async () => {
  const texts = sampleTexts(200);

  const program = Effect.gen(function* () {
    const tokenizer = yield* Tokenizer;

    return yield* Effect.forEach(texts, (text) => tokenizer.encode(text));
  });

  const bounded = await run(
    program,
    Tokenizer.layerFromEncoding(sample(), { mergeCacheCapacity: 1 }),
  );

  const unbounded = await run(program);

  expect(bounded).toEqual(unbounded);
});

it("encodes the same tokens when many fibers encode at once", async () => {
  const texts = sampleTexts(200);

  const encoded = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;
      const one = yield* Effect.forEach(texts, (text) => tokenizer.encode(text));

      const many = yield* Effect.forEach(texts, (text) => tokenizer.encode(text), {
        concurrency: "unbounded",
      });

      return { one, many };
    }),
  );

  expect(encoded.many).toEqual(encoded.one);
});
