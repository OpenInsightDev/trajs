import { NodeServices as PlatformNodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Exchange, Storage, View } from "@trajs/core";
import type { Tokens } from "@trajs/extension-tokenize";
import { tokenEstimate } from "@trajs/extension-tokenize";
import { NodeServices } from "@trajs/platform-node";
import { Effect, Layer, Predicate, Stream } from "effect";

import { config, Fixture, writeFixture } from "./produce.ts";

type PromptKind = Exclude<keyof Tokens.PromptTokens, "_tag" | "tokens">;

const kinds = [
  "text",
  "reasoning",
  "toolCall",
  "toolResult",
  "media",
] as const satisfies ReadonlyArray<PromptKind>;

interface Report {
  readonly growth: ReadonlyArray<{
    readonly parts: number;
    readonly tokens: number;
    readonly total: number;
  }>;

  readonly prompt: ReadonlyArray<{
    readonly kind: PromptKind;
    readonly tokens: number;
    readonly share: number;
  }>;
}

interface Reading {
  readonly growth: Report["growth"];

  readonly prompt: Tokens.PromptTokens | undefined;
}

const nodeFileSystem = Layer.merge(NodeServices.layer, Storage.layerFileSystem);

const layers = Layer.mergeAll(
  PlatformNodeServices.layer,
  Exchange.layer.pipe(Layer.provide(nodeFileSystem), Layer.provide(PlatformNodeServices.layer)),
);

const main = () =>
  Effect.gen(function* () {
    // writeFixture stored the token counts on the file.
    yield* writeFixture();

    const exchange = yield* Exchange.Exchange;
    const loaded = yield* exchange.load(config)(Fixture);

    const trajectory = loaded.read();

    // View.metricOutputs reads those stored estimates. No tokenizer runs here.
    const reading = yield* View.metricOutputs(tokenEstimate)(trajectory).pipe(
      Stream.map((output) => output.output),
      Stream.runFold(
        (): Reading => ({ growth: [], prompt: undefined }),
        (reading, { count, total }) => ({
          // count.tokens is this part. total is the session so far.
          growth: [
            ...reading.growth,
            { parts: reading.growth.length + 1, tokens: count.tokens, total },
          ],

          // Only a prompt estimate is kept. The last one is the kind breakdown.
          prompt: Predicate.isTagged("prompt")(count) ? count : reading.prompt,
        }),
      ),
    );

    const counted = reading.prompt;
    const promptTokens = counted?.tokens ?? 0;

    return {
      growth: reading.growth,
      prompt: kinds.map((kind) => {
        const tokens = counted?.[kind] ?? 0;

        return { kind, tokens, share: promptTokens === 0 ? 0 : tokens / promptTokens };
      }),
    } satisfies Report;
  }).pipe(Effect.provide(layers));

it.effect("main", () =>
  Effect.gen(function* () {
    const { growth, prompt } = yield* main();

    expect(growth.map((step) => step.parts)).toEqual([1, 2, 3, 4, 5, 6]);

    let total = 0;

    for (const step of growth) {
      expect(step.tokens).toBeGreaterThan(0);

      total += step.tokens;

      expect(step.total).toBe(total);
    }

    expect(prompt.map((part) => part.kind)).toEqual(kinds);
    expect(prompt.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1, 2);

    for (const part of prompt) expect(part.tokens).toBeGreaterThan(0);

    // OpenAI image estimate stored with the fixture.
    expect(prompt.find((part) => part.kind === "media")?.tokens).toBe(255);
  }),
);
