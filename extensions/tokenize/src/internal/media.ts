/**
 * The rules a payload that is not text is estimated with.
 *
 * A tokenizer answers for text and for nothing else: an image is charged by the
 * model that reads it, out of its pixels, and two models charge very different
 * numbers for the same image. The rules below are the published ones of two
 * families, named so that a caller says which one it counts for — rather than the
 * estimate being guessed from a model's name — and a caller on a different
 * generation, or counting for another provider, passes a rule of its own.
 *
 * Each family's rule is the one it publishes today: an OpenAI model covers an
 * image with tiles or with patches depending on the model, so that family has a
 * constructor for each, and a Claude model covers it with patches of its own and
 * resizes it by a rule of its own, so that family has one that computes the size
 * rather than scaling to an edge.
 */

import { Predicate } from "effect";
import type { Prompt } from "effect/ai";

import type { ImageSize } from "#/internal/image.ts";
import type { ResponseContentPart } from "#/internal/part.ts";

/**
 * A payload that is not text, as a prompt message or a response part produces it.
 */
export type MediaPart = Prompt.FilePart | Extract<ResponseContentPart, { type: "file" }>;

/**
 * How a payload that is not text is estimated, in tokens.
 *
 * The rule is handed the payload and the pixel size read out of it, which is
 * `undefined` when the payload is not an image or carries no image, such as a URL
 * to somewhere else.
 */
export type MediaRule = (part: MediaPart, size: ImageSize | undefined) => number;

/** The rule families the package names, as `MediaRuleId` accepts them. */
export const mediaRuleIds = ["openai", "anthropic"] as const;

/**
 * Name of a family a payload that is not text is priced with.
 *
 * @see {@link mediaRuleOf} for the rule a name stands for.
 */
export type MediaRuleId = (typeof mediaRuleIds)[number];

/** Tokens an image is estimated at when the caller supplies no rule of its own. */
const IMAGE_TOKENS = 85;

/** Tokens any other payload is estimated at when the caller supplies no rule. */
const FILE_TOKENS = 100;

/** Tokens an OpenAI vision model charges for any image, `gpt-4o` and `gpt-4.1`. */
const OPENAI_BASE = 85;

/** Tokens it charges for each tile the image is covered with. */
const OPENAI_TILE_TOKENS = 170;

/** The side of one of those tiles. */
const OPENAI_TILE_EDGE = 512;

/** The square an image is fitted into before its tiles are counted. */
const OPENAI_MAX_EDGE = 2048;

/** The longest short side that survives that fit. */
const OPENAI_SHORT_EDGE = 768;

/** Pixels of one of the square patches an OpenAI vision model counts in. */
const OPENAI_PATCH_EDGE = 32;

/** Tokens one of those patches is worth, the models that count in patches. */
const OPENAI_PATCH_MULTIPLIER = 1.2;

/** The longest edge an image keeps before its patches are counted. */
const OPENAI_PATCH_MAX_EDGE = 2048;

/** Most patches an image is covered with before it is scaled down. */
const OPENAI_PATCH_BUDGET = 2500;

/** The square an image is fitted into when it is read at `"low"` detail. */
const OPENAI_PATCH_LOW_EDGE = 512;

/** Pixels of one of the square patches a Claude model counts an image in. */
const ANTHROPIC_PATCH_EDGE = 28;

/** The longest edge a Claude image keeps, on the standard resolution tier. */
const ANTHROPIC_MAX_EDGE = 1568;

/** Most visual tokens one Claude image costs, on the standard resolution tier. */
const ANTHROPIC_MAX_TOKENS = 1568;

/**
 * Estimates a payload that is not text at `ai-tokenizer`'s numbers: 85 tokens for
 * an image and 100 for anything else.
 *
 * Both are placeholders rather than properties of the payload, so name a rule
 * where the count matters: `CountOptions.media` takes the family that is being
 * counted for, or a rule of your own.
 */
export const mediaTokens = (part: MediaPart): number =>
  isImage(part) ? IMAGE_TOKENS : FILE_TOKENS;

/** Whether a payload is an image, which is the only thing the families price. */
const isImage = (part: MediaPart): boolean => part.mediaType.startsWith("image/");

/** Scales a size down so neither side exceeds `max`, keeping its aspect ratio. */
const fitInside = (size: ImageSize, max: number): ImageSize => {
  const longest = Math.max(size.width, size.height);

  if (longest <= max) return size;

  const scale = max / longest;

  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) };
};

/** Scales a size down so its short side does not exceed `max`. */
const fitShortSide = (size: ImageSize, max: number): ImageSize => {
  const shortest = Math.min(size.width, size.height);

  if (shortest <= max) return size;

  const scale = max / shortest;

  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) };
};

/** The patches of `edge` pixels an image is covered with, a partial one included. */
const patchCount = (size: ImageSize, edge: number): number =>
  Math.ceil(size.width / edge) * Math.ceil(size.height / edge);

/**
 * Rounds a half pixel to the even neighbor, which is how Anthropic's own
 * implementation resolves one.
 *
 * `Math.round` rounds a half up instead, and so computes a different size for the
 * images whose short edge lands exactly between two pixels.
 */
const roundTiesToEven = (value: number): number => {
  const floor = Math.floor(value);

  if (value - floor !== 0.5) return Math.round(value);

  return floor % 2 === 0 ? floor : floor + 1;
};

/**
 * The size a Claude model resizes an image to before its patches are counted: the
 * largest aspect-preserving size whose edges are whole patches inside `maxEdge`
 * and whose patches are within `maxTokens`.
 *
 * The token limit and not the edge limit is what decides the size of nearly every
 * image, so the size is not `fitInside`'s: this is Anthropic's own reference
 * implementation, which searches for the longest edge that fits, published at
 * https://platform.claude.com/docs/en/build-with-claude/vision-coordinates#resize-your-image-before-uploading
 */
const claudeSize = (size: ImageSize, maxEdge: number, maxTokens: number): ImageSize => {
  const patched = (side: number): number =>
    Math.ceil(side / ANTHROPIC_PATCH_EDGE) * ANTHROPIC_PATCH_EDGE;

  const fits = (width: number, height: number): boolean =>
    patched(width) <= maxEdge &&
    patched(height) <= maxEdge &&
    patchCount({ width, height }, ANTHROPIC_PATCH_EDGE) <= maxTokens;

  if (fits(size.width, size.height)) return size;

  // An image taller than it is wide is the same problem with its sides swapped.
  if (size.height > size.width) {
    const turned = claudeSize({ width: size.height, height: size.width }, maxEdge, maxTokens);

    return { width: turned.height, height: turned.width };
  }

  const aspect = size.width / size.height;
  const shortEdge = (longEdge: number): number => Math.max(roundTiesToEven(longEdge / aspect), 1);

  let inside = 1;
  let outside = size.width;

  while (inside + 1 < outside) {
    const middle = Math.floor((inside + outside) / 2);

    if (fits(middle, shortEdge(middle))) inside = middle;
    else outside = middle;
  }

  return { width: inside, height: shortEdge(inside) };
};

/**
 * The size an image is scaled down to so that its patches are within `budget`,
 * after the edge it was fitted into left it covered by more.
 *
 * The scale is pulled back to a whole number of patches, so that the size it is
 * floored to cannot land one patch over the budget. This is step B of the rule
 * OpenAI publishes, at
 * https://platform.openai.com/docs/guides/images-vision#patch-based-image-tokenization
 */
const fitPatchBudget = (size: ImageSize, budget: number): ImageSize => {
  const shrink = Math.sqrt(
    (OPENAI_PATCH_EDGE * OPENAI_PATCH_EDGE * budget) / (size.width * size.height),
  );

  const whole = (side: number): number => {
    const patches = (side * shrink) / OPENAI_PATCH_EDGE;

    return Math.floor(patches) / patches;
  };

  const adjusted = shrink * Math.min(whole(size.width), whole(size.height));

  return {
    width: Math.floor(size.width * adjusted),
    height: Math.floor(size.height * adjusted),
  };
};

/** The numbers an OpenAI vision model charges for an image. */
export interface OpenAiNumbers {
  /** Tokens charged for any image, whatever its size. Defaults to 85. */
  readonly base?: number;
  /** Tokens charged for each 512px tile. Defaults to 170. */
  readonly tile?: number;
  /** Detail the image is read at; `"low"` charges the base alone. Defaults to `"high"`. */
  readonly detail?: "low" | "high";
}

/**
 * Estimates an image the way an OpenAI vision model that counts in tiles charges
 * for it.
 *
 * Use it for a model of that kind — `gpt-4o`, `gpt-4.1`, `gpt-5.1` — and
 * {@link openAiPatchRule} for one that counts in patches.
 *
 * The image is fitted into a 2048px square, its short side into 768px, covered
 * with 512px tiles, and charged the model's base tokens plus a tile each: 85 + 170
 * per tile for `gpt-4o` and `gpt-4.1`, which is what the numbers default to.
 * A `"low"` detail charges the base alone. Another generation of the family is
 * the same rule with its own numbers: `gpt-5.1` charges 70 + 140.
 *
 * The rule is the tile-based one OpenAI publishes, at
 * https://platform.openai.com/docs/guides/images-vision#tile-based-image-tokenization
 *
 * A payload the rule cannot size — anything that is not an image, or an image
 * whose pixels are not in it — is charged {@link mediaTokens} instead.
 *
 * **Example** (The published numbers)
 *
 * ```ts import.meta.vitest
 * const rule = Count.openAiRule()
 * rule(part, { width: 500, height: 500 }) // => 255
 * rule(part, { width: 513, height: 513 }) // => 765
 * ```
 *
 * @see {@link anthropicRule} and {@link openAiPatchRule} for the rest of the
 * published rules.
 * @category constructors
 */
export const openAiRule = (numbers: OpenAiNumbers = {}): MediaRule => {
  const base = numbers.base ?? OPENAI_BASE;
  const tile = numbers.tile ?? OPENAI_TILE_TOKENS;
  const detail = numbers.detail ?? "high";

  return (part, size) => {
    if (size === undefined || !isImage(part)) return mediaTokens(part);

    if (detail === "low") return base;

    const fitted = fitShortSide(fitInside(size, OPENAI_MAX_EDGE), OPENAI_SHORT_EDGE);
    const across = Math.ceil(fitted.width / OPENAI_TILE_EDGE);
    const down = Math.ceil(fitted.height / OPENAI_TILE_EDGE);

    return base + tile * across * down;
  };
};

/** The numbers an OpenAI vision model that counts in patches charges. */
export interface OpenAiPatchNumbers {
  /** Tokens one 32px patch is worth. Defaults to 1.2. */
  readonly multiplier?: number;
  /** The longest edge an image keeps. Defaults to 2048. */
  readonly maxEdge?: number;
  /** Most patches an image is covered with. Defaults to 2500. */
  readonly patchBudget?: number;
  /** The square a `"low"` detail fits the image into. Defaults to 512. */
  readonly lowEdge?: number;
  /** Detail the image is read at; `"low"` fits it into `lowEdge`. Defaults to `"high"`. */
  readonly detail?: "low" | "high";
}

/**
 * Estimates an image the way an OpenAI vision model that counts in patches
 * charges for it.
 *
 * **When to use**
 *
 * Use when a trajectory is counted for a model that counts images in patches —
 * `gpt-5.6-sol`, `gpt-5.5`, `gpt-5.4`, `gpt-5.2` or `gpt-4.1-mini` — rather than
 * for one of the models that count in tiles, which {@link openAiRule} covers.
 *
 * **Details**
 *
 * The image is fitted into a 2048px square, covered with 32px patches, scaled
 * down when those patches pass 2500, and charged a token and a fifth for each
 * patch that remains — `gpt-5.6-sol`'s and `gpt-5.6-terra`'s behavior, which is
 * what the numbers default to. A `"low"` detail fits the image into a 512px
 * square. Another model is the same rule with its own numbers:
 * `gpt-4.1-mini` charges 1.62 tokens a patch, `gpt-6-astra` fits into a 65535px
 * edge, and `gpt-5.4`'s `"low"` is a 6144 patch budget rather than a smaller
 * square. The numbers a model takes are published with the rule, at
 * https://platform.openai.com/docs/guides/images-vision#patch-based-image-tokenization
 *
 * An image that would still need more than 30000 patches is one the API refuses
 * rather than prices, so no number is right for it; this rule prices it all the
 * same rather than guessing at the refusal.
 *
 * A payload the rule cannot size — anything that is not an image, or an image
 * whose pixels are not in it — is charged {@link mediaTokens} instead.
 *
 * **Example** (The published numbers)
 *
 * ```ts import.meta.vitest
 * const rule = Count.openAiPatchRule()
 * rule(part, { width: 1024, height: 1024 }) // => 1229
 * rule(part, { width: 2048, height: 2048 }) // => 3000
 * ```
 *
 * @see {@link openAiRule} for the models that count in tiles.
 * @see {@link anthropicRule} for the other family.
 * @category constructors
 */
export const openAiPatchRule = (numbers: OpenAiPatchNumbers = {}): MediaRule => {
  const multiplier = numbers.multiplier ?? OPENAI_PATCH_MULTIPLIER;
  const maxEdge = numbers.maxEdge ?? OPENAI_PATCH_MAX_EDGE;
  const budget = numbers.patchBudget ?? OPENAI_PATCH_BUDGET;
  const lowEdge = numbers.lowEdge ?? OPENAI_PATCH_LOW_EDGE;
  const detail = numbers.detail ?? "high";

  return (part, size) => {
    if (size === undefined || !isImage(part)) return mediaTokens(part);

    if (detail === "low") {
      return Math.ceil(patchCount(fitInside(size, lowEdge), OPENAI_PATCH_EDGE) * multiplier);
    }

    const fitted = fitInside(size, maxEdge);
    const covered = patchCount(fitted, OPENAI_PATCH_EDGE);
    const resized = covered <= budget ? fitted : fitPatchBudget(fitted, budget);

    return Math.ceil(patchCount(resized, OPENAI_PATCH_EDGE) * multiplier);
  };
};

/** The numbers a Claude model charges for an image. */
export interface AnthropicNumbers {
  /** The longest edge an image keeps. Defaults to 1568, the standard tier. */
  readonly maxEdge?: number;
  /** Most visual tokens one image costs. Defaults to 1568, the standard tier. */
  readonly maxTokens?: number;
}

/**
 * Estimates an image the way a Claude model charges for it.
 *
 * **When to use**
 *
 * Use when a trajectory is counted for a Claude model, which reads an image in
 * 28px patches rather than charging it by its pixels.
 *
 * **Details**
 *
 * An image is resized to the largest size that fits both of the tier's limits —
 * neither padded edge over 1568px, and no more than 1568 visual tokens — and
 * charged a token for each 28px patch it is covered with, which is what the
 * numbers default to. The token limit and not the edge limit is what decides the
 * size of nearly every image, so a 1920 by 1080 screenshot is 1456 by 819 and
 * 1560 tokens, and not the 1568 that fitting the edge alone would allow. A model
 * of the high-resolution tier is the same rule with its own numbers, 2576 pixels
 * and 4784 tokens.
 *
 * The tier's numbers are published at
 * https://platform.claude.com/docs/en/build-with-claude/vision#evaluate-image-size,
 * and the size the rule computes is the one of Anthropic's own reference
 * implementation of the resize, at
 * https://platform.claude.com/docs/en/build-with-claude/vision-coordinates#resize-your-image-before-uploading
 *
 * A payload the rule cannot size — anything that is not an image, or an image
 * whose pixels are not in it — is charged {@link mediaTokens} instead.
 *
 * **Example** (The published numbers)
 *
 * ```ts import.meta.vitest
 * const rule = Count.anthropicRule()
 * rule(part, { width: 1000, height: 1000 }) // => 1296
 * rule(part, { width: 1920, height: 1080 }) // => 1560
 * ```
 *
 * @see {@link openAiRule} and {@link openAiPatchRule} for the other family.
 * @category constructors
 */
export const anthropicRule = (numbers: AnthropicNumbers = {}): MediaRule => {
  const maxEdge = numbers.maxEdge ?? ANTHROPIC_MAX_EDGE;
  const maxTokens = numbers.maxTokens ?? ANTHROPIC_MAX_TOKENS;

  return (part, size) => {
    if (size === undefined || !isImage(part)) return mediaTokens(part);

    return patchCount(claudeSize(size, maxEdge, maxTokens), ANTHROPIC_PATCH_EDGE);
  };
};

/**
 * The rule an option names: a family's own, one of the caller's, or the
 * placeholder when nothing was named.
 */
export const mediaRuleOf = (option?: MediaRuleId | MediaRule): MediaRule => {
  if (option === undefined) return mediaTokens;

  if (Predicate.isString(option)) {
    switch (option) {
      case "openai":
        return openAiRule();
      case "anthropic":
        return anthropicRule();
    }
  }

  return option;
};
