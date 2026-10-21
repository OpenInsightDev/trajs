/**
 * A trajectory read as the tokens its parts are worth: how the session grew as its parts
 * accumulated, and what the context of a turn was made of.
 *
 * The counts are read from the trajectory itself rather than derived here — the fixture was
 * produced with them, so `main` provides no tokenizer and the run it needs is a file system
 * and an exchange alone. What the counts are of is the parts a model was given and returned:
 * a prompt is counted kind by kind, so what a model spent on the text it was asked, on the
 * reasoning it was given back, on the calls of tools and their results and on a payload that
 * is not text is read from the count rather than only what the prompt cost in all.
 *
 * What the fixture is, and how it is produced with the counts, is `produce.ts`.
 */

import { NodeServices as PlatformNodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Exchange } from "@trajs/core";
import type { Tokens } from "@trajs/extension-tokenize";
import { NodeServices } from "@trajs/platform-node";
import { layerFileSystem } from "@trajs/utils/Storage";
import { Effect, Layer, Result, Stream } from "effect";

import { config, Fixture, writeFixture } from "./produce.ts";

/** A kind of information a prompt is counted by, as the fields of its count name them. */
type ContextKind = Exclude<keyof Tokens.PromptTokens, "_tag" | "tokens">;

/** The kinds a prompt is counted by, in the order the report states them. */
const kinds = [
  "text",
  "reasoning",
  "toolCall",
  "toolResult",
  "media",
] as const satisfies ReadonlyArray<ContextKind>;

/**
 * One point of the growth: the parts counted so far, what the last of them is worth, and what
 * the session had grown to by it.
 */
interface GrowthStep {
  /** The parts a count was read for up to and including this one. */
  readonly parts: number;
  /** Tokens the part this step is of is worth. */
  readonly added: number;
  /** Tokens the session had been worth up to and including that part. */
  readonly total: number;
}

/** What one kind of information is worth in the context, and how much of the context that is. */
interface ContextShare {
  readonly kind: ContextKind;
  readonly tokens: number;
  readonly share: number;
}

/** What the trajectory was read as. */
interface Report {
  /**
   * What the session spent on each of the parts it was counted by, and what it had spent by that
   * part: every prompt pays for the whole conversation it holds, so the total is what the session
   * cost rather than the size of the last context. Its last step states how many parts the
   * session was counted by.
   */
  readonly growth: ReadonlyArray<GrowthStep>;
  /** What the context of the last turn was made of, counted by kind. */
  readonly context: ReadonlyArray<ContextShare>;
}

/** What the fold of the counts has read so far. */
interface Reading {
  /** One step per counted part, in the order the trajectory holds them. */
  readonly growth: ReadonlyArray<GrowthStep>;
  /**
   * The count of the last prompt: the context the model was given in the end. A prompt holds
   * the conversation up to it, so the prompts before it hold less of the same conversation.
   */
  readonly prompt: Record<ContextKind, number> | undefined;
}

/** The file storage a Node program keeps its trajectories in, beside the codecs that carry and name them. */
const nodeFileSystem = Layer.merge(NodeServices.layer(), layerFileSystem);

/**
 * What the program is made of: the file system of a Node program, and the exchange reading and
 * writing the fixture through the codecs of `@trajs/platform-node`.
 */
const layers = Layer.mergeAll(
  PlatformNodeServices.layer,
  Exchange.Exchange.layer.pipe(
    Layer.provide(nodeFileSystem),
    Layer.provide(PlatformNodeServices.layer),
  ),
);

/** Produces the fixture, reads it back, and reports what the counts it holds state of it. */
const main = () =>
  Effect.gen(function* () {
    yield* writeFixture();

    const exchange = yield* Exchange.Exchange;
    const loaded = yield* exchange.load(Fixture);

    const trajectory = loaded.read(config);

    // A count is a metric part this package derived; a part it could not count is its failure
    // instead.
    const counts = trajectory.pipe(
      Stream.filterMap((part) =>
        part._tag === "Metric" && part.metric.data._tag === "ProducerOutput"
          ? Result.succeed(part.metric.data.output)
          : Result.failVoid,
      ),
    );

    // The counts are folded as they arrive rather than collected first: a count states what the
    // session had been worth by it, so the growth is read without summing the parts before each.
    const reading = yield* counts.pipe(
      Stream.runFold(
        (): Reading => ({ growth: [], prompt: undefined }),
        (reading, { count, total }) => ({
          growth: [
            ...reading.growth,
            { parts: reading.growth.length + 1, added: count.tokens, total },
          ],
          // A response is one kind of information, and a prompt is every kind it carries: the
          // context is the prompts alone, whatever kind of answer came of them.
          prompt: count._tag === "prompt" ? count : reading.prompt,
        }),
      ),
    );

    // What the context of the last turn is made of: a share is one kind's tokens of the whole.
    const prompt = reading.prompt;
    const contextTokens = kinds.reduce((sum, kind) => sum + (prompt?.[kind] ?? 0), 0);

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

    // The session was produced as eight parts, and only the six that carry content are counted —
    // the two prompts, the reasoning, the call and its result, and the answer. A session
    // declaration holds no message, and a `finish` part holds the usage a provider reported,
    // which a count is an estimate of rather than the same thing.
    expect(growth.map((step) => step.parts)).toEqual([1, 2, 3, 4, 5, 6]);

    // Every counted part is worth some tokens, and the total is what the parts before it are
    // worth beside it, so what a session had cost at any part of it is read off that part.
    let total = 0;

    for (const step of growth) {
      expect(step.added).toBeGreaterThan(0);

      total += step.added;

      expect(step.total).toBe(total);
    }

    // The context of the last turn is counted kind by kind, and the kinds partition it: every
    // kind its messages carry is a share, and the five of them are the whole.
    expect(context.map((share) => share.kind)).toEqual(kinds);
    expect(context.reduce((sum, share) => sum + share.share, 0)).toBeCloseTo(1, 2);

    for (const share of context) expect(share.tokens).toBeGreaterThan(0);

    // The image is priced by the rule the producer was given rather than counted as text: 85
    // tokens for the image and 170 for its one 512px tile, whichever tokenizer read the rest.
    expect(context.find((share) => share.kind === "media")?.tokens).toBe(255);
  }),
);
