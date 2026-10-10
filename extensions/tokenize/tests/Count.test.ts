import { expect, it } from "vite-plus/test";
import { Effect } from "effect";
import { Base64 } from "effect/encoding";
import { Prompt } from "effect/ai";
import { Response, Trajectory } from "@trajs/core";
import * as Count from "#/Count.ts";
import { Tokenizer } from "#/Tokenizer.ts";
import { describedPng, gif, jpeg, png, webpLossless } from "./images.ts";
import { sample } from "./sample.ts";

/** The tokenizer the counts are taken under. */
const sampleLayer = Tokenizer.layerFromEncoding(sample());

/** Runs a program that needs a tokenizer, providing one built for the test. */
const run = <A, E>(program: Effect.Effect<A, E, Tokenizer>): Promise<A> =>
  Effect.runPromise(program.pipe(Effect.provide(sampleLayer)));

it("counts the role and the content of every message of a prompt part", async () => {
  const part = Trajectory.promptPart(
    Prompt.fromMessages([
      Prompt.systemMessage({ content: "Be brief" }),
      Prompt.userMessage({ content: [Prompt.textPart({ text: "Hello" })] }),
    ]),
  );

  const total = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* Count.promptPart(part, tokenizer);
    }),
  );

  // `system` (6) + `Be brief` (2 + 1 + 5) + `user` (4) + `Hello` (H, e, ll, o = 4)
  expect(total).toBe(22);
});

it("counts a tool call as its name and parameters and a tool result as its id and result", async () => {
  const part = Trajectory.promptPart(
    Prompt.fromMessages([
      Prompt.assistantMessage({
        content: [
          Prompt.toolCallPart({
            id: "call-1",
            name: "get_weather",
            params: { city: "SF" },
            providerExecuted: false,
          }),
        ],
      }),
      Prompt.toolMessage({
        content: [
          Prompt.toolResultPart({
            id: "call-1",
            name: "get_weather",
            isFailure: false,
            result: "sunny",
            providerExecuted: false,
          }),
        ],
      }),
    ]),
  );

  const total = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* Count.promptPart(part, tokenizer);
    }),
  );

  // `assistant` (9) + `get_weather` (3 + 1 + 7) + `{"city":"SF"}` (2 + 4 + 3 + 2 + 2)
  // + `tool` (4) + `call-1` (ca, ll, -, 1 = 2 + 1 + 1) + `sunny` (5)
  expect(total).toBe(46);
});

it("counts the text of a response part", async () => {
  const part = Trajectory.responsePart(Response.makePart("text", { text: "Hi there" }));

  const total = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* Count.responsePart(part, tokenizer);
    }),
  );

  // `Hi` (2) + ` ` (1) + `there` (5)
  expect(total).toBe(8);
});

it("counts a response tool call and tool result recorded for an unknown tool", async () => {
  const call = Trajectory.responsePart(
    Response.anyToolCallPart({
      id: "call-1",
      name: "get_weather",
      params: { city: "SF" },
      providerExecuted: false,
    }),
  );

  const result = Trajectory.responsePart(
    Response.anyToolResultPart({
      id: "call-1",
      name: "get_weather",
      isFailure: false,
      result: "sunny",
      encodedResult: "sunny",
      providerExecuted: false,
      preliminary: false,
    }),
  );

  const totals = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        call: yield* Count.responsePart(call, tokenizer),
        result: yield* Count.responsePart(result, tokenizer),
      };
    }),
  );

  // `get_weather` (11) + `{"city":"SF"}` (13)
  expect(totals.call).toBe(24);
  // `call-1` (4) + `sunny` (5)
  expect(totals.result).toBe(9);
});

it("estimates an image and a file at the numbers ai-tokenizer uses", async () => {
  const image = Trajectory.promptPart(
    Prompt.fromMessages([
      Prompt.userMessage({
        content: [
          Prompt.filePart({ mediaType: "image/png", data: new URL("https://example.com/a.png") }),
        ],
      }),
    ]),
  );

  const file = Trajectory.responsePart(
    Response.makePart("file", { mediaType: "application/pdf", data: Uint8Array.of(1, 2, 3) }),
  );

  const totals = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        image: yield* Count.promptPart(image, tokenizer),
        file: yield* Count.responsePart(file, tokenizer),
      };
    }),
  );

  // `user` (4) + an image (85)
  expect(totals.image).toBe(89);
  // a file (100)
  expect(totals.file).toBe(100);
});

it("estimates a payload that is not text with the rule the call names", async () => {
  const part = Trajectory.promptPart(
    Prompt.fromMessages([
      Prompt.userMessage({
        content: [Prompt.filePart({ mediaType: "image/png", data: png(500, 400) })],
      }),
    ]),
  );

  // A rule of the caller's own is handed the payload and the size read out of it.
  const media = (_payload: Count.MediaPart, size: Count.ImageSize | undefined): number =>
    size?.width ?? 0;

  const totals = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        own: yield* Count.promptPart(part, tokenizer, { media }),
        first: yield* Count.promptPart(tokenizer, { media })(part),
        family: yield* Count.promptPart(part, tokenizer, { media: "anthropic" }),
        standard: yield* Count.promptPart(part, tokenizer),
      };
    }),
  );

  // `user` (4) + the caller's rule for a 500 by 400 image (500)
  expect(totals.own).toBe(504);
  expect(totals.first).toBe(totals.own);
  // `user` (4) + a token per 750 pixels of 500 by 400 (267)
  expect(totals.family).toBe(271);
  // `user` (4) + the placeholder (85)
  expect(totals.standard).toBe(89);
});

it("estimates an image the way an OpenAI vision model charges for it", () => {
  const image = Prompt.filePart({ mediaType: "image/png", data: png(1, 1) });
  const rule = Count.openAiRule();

  // The published rule: the model's base tokens plus 170 for every 512px tile.
  expect(rule(image, { width: 500, height: 500 })).toBe(255);
  expect(rule(image, { width: 513, height: 500 })).toBe(425);
  expect(rule(image, { width: 513, height: 513 })).toBe(765);
  // A short side over 768px is scaled down to 768 before the tiles are counted.
  expect(rule(image, { width: 1920, height: 1080 })).toBe(1105);
  // `low` detail charges the base alone; another generation is other numbers.
  expect(Count.openAiRule({ detail: "low" })(image, { width: 513, height: 513 })).toBe(85);
  expect(Count.openAiRule({ base: 70, tile: 140 })(image, { width: 513, height: 513 })).toBe(630);
});

it("estimates an image the way a Claude model charges for it", () => {
  const image = Prompt.filePart({ mediaType: "image/png", data: png(1, 1) });
  const rule = Count.anthropicRule();

  // A token per 750 pixels, and never more than the 1568 one image may cost.
  expect(rule(image, { width: 200, height: 200 })).toBe(54);
  expect(rule(image, { width: 1000, height: 1000 })).toBe(1334);
  expect(rule(image, { width: 1092, height: 1092 })).toBe(1568);
  expect(rule(image, { width: 1920, height: 1080 })).toBe(1568);
  expect(rule(image, { width: 2000, height: 1500 })).toBe(1568);
  // High-resolution support is the same rule with its own numbers.
  const highResolution = Count.anthropicRule({ maxEdge: 2576, maxTokens: 4784 });

  expect(highResolution(image, { width: 1920, height: 1080 })).toBe(2765);
  expect(highResolution(image, { width: 2000, height: 1500 })).toBe(4000);
});

it("charges the placeholder where a rule has no size to work from", () => {
  const rule = Count.openAiRule();
  const document = Prompt.filePart({ mediaType: "application/pdf", data: Uint8Array.of(1) });

  const linked = Prompt.filePart({
    mediaType: "image/png",
    data: new URL("https://example.com/a.png"),
  });

  // A payload that is not an image, and an image whose pixels are not in it.
  expect(rule(document, { width: 500, height: 500 })).toBe(100);
  expect(rule(linked, undefined)).toBe(85);
});

it("reads the pixel size out of the image a part carries", async () => {
  const part = (data: string | Uint8Array | URL) =>
    Trajectory.promptPart(
      Prompt.fromMessages([
        Prompt.userMessage({ content: [Prompt.filePart({ mediaType: "image/png", data })] }),
      ]),
    );

  const totals = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        png: yield* Count.promptPart(part(png(1000, 1000)), tokenizer, { media: "anthropic" }),
        gif: yield* Count.promptPart(part(gif(1000, 1000)), tokenizer, { media: "anthropic" }),
        jpeg: yield* Count.promptPart(part(jpeg(1000, 1000)), tokenizer, { media: "anthropic" }),
        webp: yield* Count.promptPart(part(webpLossless(1000, 1000)), tokenizer, {
          media: "anthropic",
        }),
        encoded: yield* Count.promptPart(
          part(`data:image/png;base64,${Base64.encode(png(1000, 1000))}`),
          tokenizer,
          { media: "anthropic" },
        ),
        described: yield* Count.promptPart(part(describedPng), tokenizer, { media: "anthropic" }),
        linked: yield* Count.promptPart(part(new URL("https://example.com/a.png")), tokenizer, {
          media: "anthropic",
        }),
      };
    }),
  );

  // `user` (4) + 1334 tokens for a 1000 by 1000 image, whatever format holds it
  expect(totals.png).toBe(1338);
  expect(totals.gif).toBe(1338);
  expect(totals.jpeg).toBe(1338);
  expect(totals.webp).toBe(1338);
  expect(totals.encoded).toBe(1338);
  // `user` (4) + one token for the real one-pixel PNG
  expect(totals.described).toBe(5);
  // `user` (4) + the placeholder: a URL carries no pixels
  expect(totals.linked).toBe(89);
});

it("counts nothing for a part that carries no text", async () => {
  const part = Trajectory.responsePart(Response.makePart("response-metadata", {}));

  const total = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* Count.responsePart(part, tokenizer);
    }),
  );

  expect(total).toBe(0);
});

it("fails on a text holding a special token the tokenizer does not allow", async () => {
  const part = Trajectory.responsePart(Response.makePart("text", { text: "<|fim|>" }));

  const failure = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return yield* Effect.flip(Count.responsePart(part, tokenizer));
    }),
  );

  expect(failure.token).toBe("<|fim|>");
});

it("counts a part the same way directly and with the tokenizer applied first", async () => {
  const prompt = Trajectory.promptPart(Prompt.make("Hello"));
  const response = Trajectory.responsePart(Response.makePart("text", { text: "Hi there" }));

  const totals = await run(
    Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;

      return {
        prompt: yield* Count.promptPart(prompt, tokenizer),
        promptFirst: yield* Count.promptPart(tokenizer)(prompt),
        response: yield* Count.responsePart(response, tokenizer),
        responseFirst: yield* Count.responsePart(tokenizer)(response),
      };
    }),
  );

  expect(totals.promptFirst).toBe(totals.prompt);
  expect(totals.responseFirst).toBe(totals.response);
});
