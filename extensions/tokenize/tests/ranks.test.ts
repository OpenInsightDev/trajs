import { expect, it } from "vite-plus/test";
import { Effect } from "effect";
import { Tokenizer } from "#/Tokenizer.ts";
import { fromRanks, type RankSource } from "#/internal/ranks.ts";

/** Base64 of the bytes one token stands for, as a rank source states it. */
const token = (bytes: ReadonlyArray<number>): string => Buffer.from(bytes).toString("base64");

/** A rank source of one run, which states the pattern and the special tokens. */
const source = (bpe_ranks: string): RankSource => ({
  pat_str: "\\p{L}+|[^\\p{L}]+",
  special_tokens: { "<|end|>": 300 },
  bpe_ranks,
});

it("reads a run of ranks into the storage a tokenizer reads", () => {
  // The first field of a line is the literal text its run starts with, and the
  // rank of a token is the offset plus its position in the run.
  const encoding = fromRanks(
    "tiny",
    source(`! 5 ${token([0x61])} ${token([0x62])} ${token([0x61, 0x62])} ${token([0xff])}`),
  );

  expect(encoding.name).toBe("tiny");
  expect(encoding.pat_str).toBe("\\p{L}+|[^\\p{L}]+");
  expect(encoding.special_tokens).toEqual({ "<|end|>": 300 });
  expect(encoding.stringEncoder).toEqual({ a: 5, b: 6, ab: 7 });
  expect(encoding.binaryEncoder).toEqual([[Uint8Array.of(0xff), 8]]);
  expect(encoding.decoder[5]).toBe("a");
  expect(encoding.decoder[8]).toEqual(Uint8Array.of(0xff));
});

it("reads several runs, keeping the rank each one starts at", () => {
  const encoding = fromRanks(
    "runs",
    source([`! 0 ${token([0x61])}`, `" 4 ${token([0x62])} ${token([0x61, 0x62])}`].join("\n")),
  );

  expect(encoding.stringEncoder).toEqual({ a: 0, b: 4, ab: 5 });
});

it("leaves the ranks a run does not state unread", () => {
  // The markers of a model whose special tokens occupy the first ranks are not
  // part of its merge tokens, so the first run starts after them.
  const encoding = fromRanks("late", source(`! 5 ${token([0x61])} ${token([0x62])}`));

  expect(encoding.stringEncoder).toEqual({ a: 5, b: 6 });
  expect(encoding.decoder[5]).toBe("a");
  expect(encoding.decoder[0]).toBeUndefined();
});

it("orders the binary ranks by byte order", () => {
  const encoding = fromRanks(
    "ordered",
    source(
      `! 0 ${[
        token([0xff]),
        token([0x80, 0x81]),
        token([0xe2, 0x82]),
        token([0x80]),
        token([0xe2]),
      ].join(" ")}`,
    ),
  );

  // `[0x80]` before `[0x80, 0x81]`, then the `0xe2` slices in the same way, then
  // `0xff`: the order the binary lookup searches in.
  expect(encoding.binaryEncoder.map(([, rank]) => rank)).toEqual([3, 1, 4, 2, 0]);
  expect(encoding.binaryEncoder[0][0]).toEqual(Uint8Array.of(0x80));
});

it("tokenizes with an encoding read from a rank source", async () => {
  const encoding = fromRanks(
    "tiny",
    source(`! 0 ${token([0x61])} ${token([0x62])} ${token([0x61, 0x62])}`),
  );

  const tokens = await Effect.runPromise(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* tokenizer.encode("ab");
    }).pipe(Effect.provide(Tokenizer.layerFromEncoding(encoding))),
  );

  expect(tokens).toEqual([2]);
});
