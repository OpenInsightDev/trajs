/**
 * Token counts of the parts a trajectory records.
 *
 * A recording holds the messages a model was given and the parts it returned, so
 * counting one part is counting the text it carries. The estimate follows
 * `ai-tokenizer`: a text or reasoning part is the text it holds, a tool call is
 * its name and the JSON of its parameters, a tool result is its identifier and
 * its result, an image or a file is a fixed estimate, and a prompt part counts
 * the role of each of its messages before that message's content.
 *
 * These are the counts of the parts themselves. The overhead a model adds around
 * them — a base cost per request, a cost per message or per tool, and the
 * multiplier a model applies to content — is not included, because trajs records
 * no such configuration: add the numbers of the model you count for.
 *
 * A payload that is not text is the one thing a tokenizer cannot answer for: an
 * image costs the model that reads it its own base tokens plus tiles counted over
 * the image's own pixels, so the 85 and 100 tokens `ai-tokenizer` estimates an
 * image and a file at are placeholders. Name the family being counted for with
 * {@link CountOptions.media}. Where a recording carries the usage a provider
 * reported — a `finish` part does — that number is exact and should be preferred.
 */

import { Effect, Function, Predicate } from "effect";
import type { Trajectory } from "@trajs/core";
import { type Contribution, promptContributions, responseContributions } from "#/internal/count.ts";
import type { ImageSize } from "#/internal/image.ts";
import {
  type AnthropicNumbers,
  type MediaPart,
  type MediaRule,
  type MediaRuleId,
  type OpenAiNumbers,
  anthropicRule,
  mediaRuleOf,
  mediaTokens,
  openAiRule,
} from "#/internal/media.ts";
import type * as Tokenizer from "#/Tokenizer.ts";

export { anthropicRule, mediaTokens, openAiRule };

export type { AnthropicNumbers, ImageSize, MediaPart, MediaRule, MediaRuleId, OpenAiNumbers };

/**
 * How the tokens of a part are counted.
 *
 * **When to use**
 *
 * Use when the count of a recording that carries images should be the count of
 * the model that will read it: a vision model charges for an image by the image's
 * pixels, so no one estimate is every model's.
 *
 * **Details**
 *
 * `media` names the rule family to estimate a payload that is not text with, or
 * is a rule of the caller's own:
 *
 * - `"openai"` — a base token count plus a 512px tile each, `ai-tokenizer`'s own
 *   numbers for the `gpt-4o` generation.
 * - `"anthropic"` — a token per 750 pixels, up to 1568 tokens for one image.
 * - a rule — anything else, including {@link openAiRule} and {@link anthropicRule}
 *   called with another generation's numbers.
 *
 * The rule is handed the payload and the pixel size read out of it — `undefined`
 * for a file, or for an image whose bytes are not in the payload — so a rule can
 * fall back to {@link mediaTokens} where there is nothing to size. Nothing here
 * guesses a rule from a model's name: the estimation is chosen by the caller.
 *
 * @see {@link openAiRule} and {@link anthropicRule} for the families' numbers.
 * @category models
 */
export interface CountOptions {
  /** The rule a payload that is not text is estimated with. */
  readonly media?: MediaRuleId | MediaRule;
}

/**
 * Whether a call's first argument is the tokenizer rather than a part.
 *
 * Counting takes the part first or the tokenizer first, and the options after
 * both, so arity alone cannot tell the two call styles apart: the tokenizer is
 * the argument that names the encoding, and a part is one of the recorded kinds.
 */
const isTokenizer = <Value>(value: Value): boolean => Predicate.hasProperty(value, "encodingName");

/**
 * Counts what a part contributes: text under the encoding, estimates as they are.
 */
const countContributions = (
  tokenizer: Tokenizer.Service,
  contributions: ReadonlyArray<Contribution>,
): Effect.Effect<number, Tokenizer.DisallowedSpecialToken> =>
  Effect.gen(function* () {
    let total = 0;

    for (const contribution of contributions) {
      if (Predicate.isString(contribution)) {
        total += yield* tokenizer.count(contribution);
      } else {
        total += contribution;
      }
    }

    return total;
  });

/**
 * Estimates the tokens the messages of a prompt part are worth.
 *
 * **When to use**
 *
 * Use when a recording should be measured against a context window, or when the
 * parts of a recording should be compared by size: to count what one prompt
 * costs before it is sent, or to find the prompt of a recording that dominates
 * it.
 *
 * **Details**
 *
 * The count is the role of every message the part holds followed by that
 * message's content, estimated the way `ai-tokenizer` estimates an AI SDK
 * message: the text of a part under the tokenizer's encoding, the name and JSON
 * parameters of a tool call, the identifier and result of a tool result, and a
 * fixed number of tokens for an image or a file. See `Count` for what the
 * estimate does and does not include.
 *
 * The tokenizer is the encoding to count under, so a recording is measured
 * against the model that will read it. A text holding a special token the
 * tokenizer does not allow fails the count with
 * {@link Tokenizer.DisallowedSpecialToken}; count such a text with
 * `Tokenizer.Service.encode` and the options that suit it instead.
 *
 * Both call styles are supported: `Count.promptPart(part, tokenizer)` counts one
 * part, and `Count.promptPart(tokenizer)` applies the tokenizer first so a list
 * of parts is counted in one pass.
 *
 * **Example** (Counting the prompt of a turn)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Trajectory } from "@trajs/core"
 * import { Count, Encoding, Tokenizer } from "@trajs/extension-tokenize"
 *
 * const tiny = Encoding.Encoding.make({
 *   name: "tiny",
 *   pat_str: "[\\s\\S]",
 *   special_tokens: {},
 *   stringEncoder: { a: 0, b: 1 },
 *   binaryEncoder: [],
 *   decoder: { 0: "a", 1: "b" }
 * })
 *
 * const program = Effect.gen(function* () {
 *   const tokenizer = yield* Tokenizer.Tokenizer
 *   const part = Trajectory.promptPart(Prompt.make("Hello"))
 *
 *   return yield* Count.promptPart(part, tokenizer)
 * })
 * ```
 *
 * @see {@link responsePart} for counting what a model returned.
 * @category combinators
 */
export const promptPart: {
  (
    part: Trajectory.PromptPart,
    tokenizer: Tokenizer.Service,
    options?: CountOptions,
  ): Effect.Effect<number, Tokenizer.DisallowedSpecialToken>;
  (
    tokenizer: Tokenizer.Service,
    options?: CountOptions,
  ): (part: Trajectory.PromptPart) => Effect.Effect<number, Tokenizer.DisallowedSpecialToken>;
} = Function.dual(
  (args) => !isTokenizer(args[0]),
  (part: Trajectory.PromptPart, tokenizer: Tokenizer.Service, options?: CountOptions) =>
    countContributions(tokenizer, promptContributions(part, mediaRuleOf(options?.media))),
);

/**
 * Estimates the tokens a response part is worth.
 *
 * **When to use**
 *
 * Use when a recording should be measured against a context window, or when the
 * parts of a recording should be compared by size: to count what a model
 * answered with, or to find the tool result of a recording that dominates it.
 *
 * **Details**
 *
 * A response part is one part a model returned, so it is estimated the way
 * `ai-tokenizer` estimates a content part: a text or reasoning part is the text
 * it holds, a tool call is its name and the JSON of its parameters, a tool
 * result is its identifier and its result, and an image or a file is a fixed
 * number of tokens. A source, response metadata or finish part carries no text
 * the estimate counts, so it is worth nothing. See `Count` for what the estimate
 * does and does not include.
 *
 * The part is taken in its tolerant form, so a response recorded for a tool the
 * toolkit no longer holds is counted the same way. A text holding a special
 * token the tokenizer does not allow fails the count with
 * {@link Tokenizer.DisallowedSpecialToken}.
 *
 * Both call styles are supported: `Count.responsePart(part, tokenizer)` counts one
 * part, and `Count.responsePart(tokenizer)` applies the tokenizer first so a list
 * of parts is counted in one pass.
 *
 * **Example** (Counting what a model answered)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Response, Trajectory } from "@trajs/core"
 * import { Count, Tokenizer } from "@trajs/extension-tokenize"
 *
 * const program = Effect.gen(function* () {
 *   const tokenizer = yield* Tokenizer.Tokenizer
 *   const part = Trajectory.responsePart(Response.makePart("text", { text: "Hi there" }))
 *
 *   return yield* Count.responsePart(part, tokenizer)
 * })
 * ```
 *
 * @see {@link promptPart} for counting what a model was given.
 * @category combinators
 */
export const responsePart: {
  (
    part: Trajectory.AnyResponsePart,
    tokenizer: Tokenizer.Service,
    options?: CountOptions,
  ): Effect.Effect<number, Tokenizer.DisallowedSpecialToken>;
  (
    tokenizer: Tokenizer.Service,
    options?: CountOptions,
  ): (part: Trajectory.AnyResponsePart) => Effect.Effect<number, Tokenizer.DisallowedSpecialToken>;
} = Function.dual(
  (args) => !isTokenizer(args[0]),
  (part: Trajectory.AnyResponsePart, tokenizer: Tokenizer.Service, options?: CountOptions) =>
    countContributions(tokenizer, responseContributions(part, mediaRuleOf(options?.media))),
);
