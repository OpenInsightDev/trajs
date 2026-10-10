import { expect, it } from "vite-plus/test";
import { Schema } from "effect";
import { Encoding } from "#/Encoding.ts";
import { sample } from "./sample.ts";

it("reads the generated data of an encoding", () => {
  const encoding = Schema.decodeUnknownSync(Encoding)({
    name: "tiny",
    pat_str: "[\\s\\S]",
    special_tokens: { "<|end|>": 2 },
    stringEncoder: { a: 0 },
    binaryEncoder: [[Uint8Array.of(0xff), 1]],
    decoder: { 0: "a", 1: Uint8Array.of(0xff) },
  });

  expect(encoding.name).toBe("tiny");
  expect(encoding.stringEncoder["a"]).toBe(0);
  expect(encoding.decoder[1]).toEqual(Uint8Array.of(0xff));
  expect(encoding.binaryEncoder[0][1]).toBe(1);
});

it("rejects data that is not a whole encoding", () => {
  expect(() => Schema.decodeUnknownSync(Encoding)({ name: "tiny" })).toThrow();
});

it("builds an encoding whose bytes are its tokens", () => {
  const encoding = sample();

  expect(encoding.decoder[0x61]).toBe("a");
  expect(encoding.decoder[0xff]).toEqual(Uint8Array.of(0xff));
  expect(encoding.decoder[256]).toBe("ll");
  expect(encoding.special_tokens["<|endoftext|>"]).toBe(300);
});
