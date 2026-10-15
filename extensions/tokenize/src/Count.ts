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
 * image costs the model that reads it its own base tokens, plus tiles or patches
 * counted over the image's own pixels, so the 85 and 100 tokens `ai-tokenizer`
 * estimates an image and a file at are placeholders. Name the family being counted
 * for with {@link CountOptions.media}. Where a recording carries the usage a
 * provider reported — a `finish` part does — that number is exact and should be
 * preferred.
 *
 * Counting is an Effect that asks the run for its tokenizer, so which provider and
 * model a count is taken with is chosen where a run is provided with a layer of
 * `Tokenizer.Tokenizer` rather than at the call.
 */

import { Effect } from "effect";
import type { AiError, Tokenizer } from "effect/ai";

import { countedOf } from "#/internal/count.ts";
import type { ImageSize } from "#/internal/image.ts";
import {
  type AnthropicNumbers,
  type MediaPart,
  type MediaRule,
  type MediaRuleId,
  type OpenAiNumbers,
  type OpenAiPatchNumbers,
  anthropicRule,
  mediaRuleOf,
  mediaTokens,
  openAiPatchRule,
  openAiRule,
} from "#/internal/media.ts";
import type { PromptPart, ResponsePart } from "#/internal/part.ts";

export { anthropicRule, mediaTokens, openAiPatchRule, openAiRule };

export type {
  AnthropicNumbers,
  ImageSize,
  MediaPart,
  MediaRule,
  MediaRuleId,
  OpenAiNumbers,
  OpenAiPatchNumbers,
};

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
 * - `"openai"` — a base token count plus a 512px tile each, the numbers OpenAI
 *   publishes for the models that count in tiles, `gpt-4o` among them.
 * - `"anthropic"` — a token per 28px patch, up to 1568 tokens for one image.
 * - a rule — anything else, including {@link openAiRule}, {@link openAiPatchRule}
 *   and {@link anthropicRule} called with another generation's numbers.
 *
 * An OpenAI model that counts in patches — `gpt-5.6-sol`, `gpt-5.5`, `gpt-5.4` —
 * has no family name of its own here, so its rule is given as
 * {@link openAiPatchRule} rather than as `"openai"`.
 *
 * The rule is handed the payload and the pixel size read out of it — `undefined`
 * for a file, or for an image whose bytes are not in the payload — so a rule can
 * fall back to {@link mediaTokens} where there is nothing to size. Nothing here
 * guesses a rule from a model's name: the estimation is chosen by the caller.
 *
 * @see {@link openAiRule}, {@link openAiPatchRule} and {@link anthropicRule} for
 * the families' numbers.
 * @category models
 */
export interface CountOptions {
  /** The rule a payload that is not text is estimated with. */
  readonly media?: MediaRuleId | MediaRule;
}

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
 * message: the text of a part under the tokenizer, the name and JSON
 * parameters of a tool call, the identifier and result of a tool result, and a
 * fixed number of tokens for an image or a file. See `Count` for what the
 * estimate does and does not include.
 *
 * The tokenizer is the run's own, so a recording is measured against the model
 * that will read it by providing the run with the layer built for that model; the
 * choice of Anthropic or OpenAI is made there and not here. A count that fails
 * fails the call with the `AiError` the tokenizer fails with.
 *
 * **Example** (Counting the prompt of a turn)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Extra, Trajectory } from "@trajs/core"
 * import { Count, Tokenizer } from "@trajs/extension-tokenize"
 *
 * const part = Trajectory.promptPart(Extra.makeKit())({
 *   prompt: Prompt.make("Hello"),
 *   sessionId: "01890a5d-ac96-774b-bcce-b302099a8057"
 * })
 *
 * const tokens = await Effect.runPromise(
 *   Count.promptPart(part).pipe(Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" })))
 * )
 * ```
 *
 * @see {@link responsePart} for counting what a model returned.
 * @category combinators
 */
export const promptPart = (
  part: PromptPart,
  options?: CountOptions,
): Effect.Effect<number, AiError.AiError, Tokenizer.Tokenizer> =>
  Effect.map(countedOf(part, mediaRuleOf(options?.media)), (counted) => counted.tokens);

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
 * toolkit no longer holds is counted the same way. A count that fails fails the
 * call with the `AiError` the tokenizer fails with.
 *
 * **Example** (Counting what a model answered)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Extra, Response, Toolkit, Trajectory } from "@trajs/core"
 * import { Count, Tokenizer } from "@trajs/extension-tokenize"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const responsePart = Trajectory.ResponsePart({
 *   toolkit: Toolkit.empty,
 *   extrakit: Extra.makeKit(),
 *   stream: false
 * })
 * const part = responsePart.make({ response: Response.makePart("text", { text: "Hi there" }), sessionId, extra: {} })
 *
 * const tokens = await Effect.runPromise(
 *   Count.responsePart(part).pipe(Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" })))
 * )
 * ```
 *
 * @see {@link promptPart} for counting what a model was given.
 * @category combinators
 */
export const responsePart = (
  part: ResponsePart,
  options?: CountOptions,
): Effect.Effect<number, AiError.AiError, Tokenizer.Tokenizer> =>
  Effect.map(countedOf(part, mediaRuleOf(options?.media)), (counted) => counted.tokens);
