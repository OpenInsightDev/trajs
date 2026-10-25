import { NodeServices as PlatformNodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Exchange, Storage, View } from "@trajs/core";
import type { Tokens } from "@trajs/extension-tokenize";
import { tokenEstimate } from "@trajs/extension-tokenize";
import { NodeServices } from "@trajs/platform-node";
import { Effect, Layer, Stream } from "effect";

import { config, Fixture, writeFixture } from "./produce.ts";

type ContextKind = Exclude<keyof Tokens.PromptTokens, "_tag" | "tokens">;

const kinds = [
  "text",
  "reasoning",
  "toolCall",
  "toolResult",
  "media",
] as const satisfies ReadonlyArray<ContextKind>;

interface GrowthStep {
  readonly parts: number;

  readonly added: number;

  readonly total: number;
}

interface ContextShare {
  readonly kind: ContextKind;
  readonly tokens: number;
  readonly share: number;
}

interface Report {
  readonly growth: ReadonlyArray<GrowthStep>;

  readonly context: ReadonlyArray<ContextShare>;
}

interface Reading {
  readonly growth: ReadonlyArray<GrowthStep>;

  readonly prompt: Tokens.PromptTokens | undefined;
}

const nodeFileSystem = Layer.merge(NodeServices.layer(), Storage.layerFileSystem);

const layers = Layer.mergeAll(
  PlatformNodeServices.layer,
  Exchange.layer.pipe(Layer.provide(nodeFileSystem), Layer.provide(PlatformNodeServices.layer)),
);

const main = () =>
  Effect.gen(function* () {
    yield* writeFixture();

    const exchange = yield* Exchange.Exchange;
    const loaded = yield* exchange.load(config)(Fixture);

    const trajectory = loaded.read();

    const reading = yield* View.produced(tokenEstimate)(trajectory).pipe(
      Stream.map((output) => output.output),
      Stream.runFold(
        (): Reading => ({ growth: [], prompt: undefined }),
        (reading, { count, total }) => ({
          growth: [
            ...reading.growth,
            { parts: reading.growth.length + 1, added: count.tokens, total },
          ],

          prompt: count._tag === "prompt" ? count : reading.prompt,
        }),
      ),
    );

    const prompt = reading.prompt;
    const contextTokens = prompt?.tokens ?? 0;

    return {
      growth: reading.growth,
      context: kinds.map((kind) => {
        const tokens = prompt?.[kind] ?? 0;

        return { kind, tokens, share: contextTokens === 0 ? 0 : tokens / contextTokens };
      }),
    } satisfies Report;
  }).pipe(Effect.provide(layers));

it.effect("main", () =>
  Effect.gen(function* () {
    const { growth, context } = yield* main();

    expect(growth.map((step) => step.parts)).toEqual([1, 2, 3, 4, 5, 6]);

    let total = 0;

    for (const step of growth) {
      expect(step.added).toBeGreaterThan(0);

      total += step.added;

      expect(step.total).toBe(total);
    }

    expect(context.map((share) => share.kind)).toEqual(kinds);
    expect(context.reduce((sum, share) => sum + share.share, 0)).toBeCloseTo(1, 2);

    for (const share of context) expect(share.tokens).toBeGreaterThan(0);

    expect(context.find((share) => share.kind === "media")?.tokens).toBe(255);
  }),
);
