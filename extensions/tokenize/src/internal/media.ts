/**
 * The rules a payload that is not text is estimated with.
 *
 * A tokenizer answers for text and for nothing else: an image is charged by the
 * model that reads it, out of its pixels, and two models charge very different
 * numbers for the same image. The rules below are the published ones of two
 * families, named so that a caller says which one it counts for — rather than the
 * estimate being guessed from a model's name — and a caller on a different
 * generation, or counting for another provider, passes a rule of its own.
 */

import { Predicate } from "effect";
import type { Prompt } from "effect/ai";
import type { Trajectory } from "@trajs/core";
import type { ImageSize } from "#/internal/image.ts";

/** The content part a recorded response part carries. */
type RecordedResponsePart = Trajectory.AnyResponsePart["response"];

/**
 * A payload that is not text, as a prompt message or a response part records it.
 */
export type MediaPart = Prompt.FilePart | Extract<RecordedResponsePart, { type: "file" }>;

/**
 * How a payload that is not text is estimated, in tokens.
 *
 * The rule is handed the payload and the pixel size read out of it, which is
 * `undefined` when the payload is not an image or carries no image, such as a URL
 * to somewhere else.
 */
export type MediaRule = (part: MediaPart, size: ImageSize | undefined) => number;

export type MediaRuleId = "openai" | "anthropic";

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

/** Pixels one token of a Claude image covers. */
const ANTHROPIC_PIXELS_PER_TOKEN = 750;

/** The longest edge a Claude image keeps. */
const ANTHROPIC_MAX_EDGE = 1568;

/** Most tokens one Claude image costs. */
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
 * Estimates an image the way an OpenAI vision model charges for it.
 *
 * The image is fitted into a 2048px square, its short side into 768px, covered
 * with 512px tiles, and charged the model's base tokens plus a tile each: 85 + 170
 * per tile for `gpt-4o` and `gpt-4.1`, which is what the numbers default to. A
 * `"low"` detail charges the base alone. Another generation of the family is the
 * same rule with its own numbers: `gpt-5.1` charges 70 + 140.
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
 * @see {@link anthropicRule} for the other family.
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

/** The numbers a Claude model charges for an image. */
export interface AnthropicNumbers {
  /** Pixels one token covers. Defaults to 750. */
  readonly pixelsPerToken?: number;
  /** The longest edge an image keeps. Defaults to 1568. */
  readonly maxEdge?: number;
  /** Most tokens one image costs. Defaults to 1568. */
  readonly maxTokens?: number;
}

/**
 * Estimates an image the way a Claude model charges for it.
 *
 * The image is fitted into a 1568px edge and charged a token for every 750 of its
 * pixels, up to 1568 tokens: a 1000 by 1000 image is 1334 tokens and anything at
 * 1092 by 1092 or beyond is the 1568 that one image may cost. A model with
 * high-resolution support is the same rule with its own numbers, 2576 pixels and
 * 4784 tokens.
 *
 * A payload the rule cannot size — anything that is not an image, or an image
 * whose pixels are not in it — is charged {@link mediaTokens} instead.
 *
 * **Example** (The published numbers)
 *
 * ```ts import.meta.vitest
 * const rule = Count.anthropicRule()
 * rule(part, { width: 1000, height: 1000 }) // => 1334
 * rule(part, { width: 1920, height: 1080 }) // => 1568
 * ```
 *
 * @see {@link openAiRule} for the other family.
 * @category constructors
 */
export const anthropicRule = (numbers: AnthropicNumbers = {}): MediaRule => {
  const pixelsPerToken = numbers.pixelsPerToken ?? ANTHROPIC_PIXELS_PER_TOKEN;
  const maxEdge = numbers.maxEdge ?? ANTHROPIC_MAX_EDGE;
  const maxTokens = numbers.maxTokens ?? ANTHROPIC_MAX_TOKENS;

  return (part, size) => {
    if (size === undefined || !isImage(part)) return mediaTokens(part);

    const fitted = fitInside(size, maxEdge);
    const tokens = Math.ceil((fitted.width * fitted.height) / pixelsPerToken);

    return Math.min(tokens, maxTokens);
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
