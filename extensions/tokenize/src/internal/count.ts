/**
 * What a recorded trajectory part is worth, before a tokenizer counts it.
 *
 * The estimate follows `ai-tokenizer`'s `sdk.ts`: a part contributes the text it
 * carries, a tool call contributes its name and the JSON of its parameters, a
 * tool result contributes its identifier and its result, and a payload that is
 * not text contributes a fixed number of tokens. The overheads a model's own
 * token configuration adds — the base overhead of a request, a per-message or
 * per-tool overhead, the content multiplier, and the cost of a tool's schema —
 * are not part of it, because trajs records no such configuration.
 *
 * Every contribution is attributed to a kind, and the kinds partition a part's
 * count: text and reasoning are their own text, a tool call is its name and
 * parameters, a tool result is its identifier and its result, and a payload that
 * is not text is a fixed estimate. The kinds are the buckets a prompt's count
 * states, and what a tool result's count pairs with — see {@link Counted}.
 *
 * Text is what a tokenizer can actually answer for. A payload that is not text is
 * only estimated, because what it costs is a property of the model that reads it
 * and of the payload's own pixels, not of the tokenizer: the rule a caller names
 * decides, and `media.ts` holds the families.
 *
 * Counting a part is counting its contributions: text becomes the tokens the
 * tokenizer gives it, a rule's estimate is added as it is, and the two are kept
 * apart in {@link Counted}, so that an estimate can state how much of its count a
 * rule priced rather than the tokenizer.
 */

import { Effect, Predicate } from "effect";
import { Tokenizer } from "effect/ai";
import type { AiError, Prompt } from "effect/ai";

import { imageSize } from "#/internal/image.ts";
import type { MediaRule } from "#/internal/media.ts";
import type {
  CountedPart,
  PromptPart,
  ResponseContentPart,
  ResponsePart,
} from "#/internal/part.ts";

/**
 * The kinds of information a count is attributed to, which are the buckets a
 * prompt's count states.
 *
 * A kind is named the way the datum states it rather than the way a message part
 * names it, so a `tool-call` part contributes to `toolCall` and a `file` part —
 * the one kind that is priced by a rule rather than the tokenizer — to `media`.
 */
export interface KindTokens {
  /** Tokens the text of a part is worth. */
  readonly text: number;
  /** Tokens the reasoning of a part is worth. */
  readonly reasoning: number;
  /** Tokens the calls of a part are worth: each name and the JSON of its parameters. */
  readonly toolCall: number;
  /** Tokens the results of a part are worth: each identifier and its result. */
  readonly toolResult: number;
  /** Tokens a rule priced for a payload that is not text, which a `file` carries. */
  readonly media: number;
}

/** The name of one of the kinds a count is attributed to. */
export type CountKind = keyof KindTokens;

/**
 * What one contribution to a part's count is: text to count under a tokenizer,
 * or a fixed estimate for a payload that is not text.
 *
 * A contribution of a tool call carries the call's `id`, so that what one call
 * is worth is known rather than only the total of every call a part carries — a
 * tool result pairs with the call it answers by that id.
 */
type Contribution =
  | { readonly kind: CountKind; readonly text: string; readonly call?: string }
  | { readonly kind: CountKind; readonly estimate: number };

/**
 * The kind the message parts of a given tag contribute to.
 *
 * A part is tagged the way `effect/ai` tags it and the count is bucketed the way
 * the datum states it, so the two are mapped rather than spelled alike.
 */
const kindOf: Record<PartTag, CountKind> = {
  text: "text",
  reasoning: "reasoning",
  "tool-call": "toolCall",
  "tool-result": "toolResult",
  file: "media",
};

/** The JSON text of a payload, or nothing when the payload is absent. */
const jsonText = <Payload>(payload: Payload): string | undefined =>
  Predicate.isNullish(payload) ? undefined : JSON.stringify(payload);

/** The text of a payload: a string as it is, anything else as JSON. */
const payloadText = <Payload>(payload: Payload): string | undefined =>
  Predicate.isString(payload) ? payload : jsonText(payload);

/** The kind of every message part a prompt message or a recorded response part declares. */
type AnyPartTag = Prompt.Part["type"] | ResponseContentPart["type"];

/**
 * The kinds of message part a count takes from, as `PartTag` accepts them.
 *
 * A kind is one that carries content: text or reasoning, the name and parameters
 * of a tool call, the identifier and result of a tool result, and a payload that
 * is not text. The kinds that carry meta information instead — the approval of a
 * tool call, the source of a response, its metadata and its finish — hold nothing
 * a tokenizer answers for, so a count is not taken from them and a recording is
 * not annotated by them.
 */
export const contentTags = ["text", "reasoning", "tool-call", "tool-result", "file"] as const;

/**
 * A kind of message part a count can be taken from.
 *
 * These are the kinds a recording is annotated by, so what a caller names is the
 * content it wants an estimate for rather than the kind of part carrying it.
 */
export type PartTag = (typeof contentTags)[number];

/** Whether a kind carries content rather than meta information. */
const isContentTag = (tag: AnyPartTag): tag is PartTag =>
  contentTags.some((content) => content === tag);

const kindsOf = (part: CountedPart): ReadonlyArray<PartTag> =>
  Predicate.isTagged("Prompt")(part)
    ? part.messages.flatMap((message) =>
        message.role === "system"
          ? ["text"]
          : message.content.map((content) => content.type).filter(isContentTag),
      )
    : [part.response.type].filter(isContentTag);

/**
 * Whether a part carries a message part of one of the given kinds.
 *
 * A response part is one message part itself, so it carries its own kind. A
 * system message holds its content as text rather than as parts, so it carries
 * `text`.
 */
export const carriesAnyOf = (part: CountedPart, tags: ReadonlyArray<PartTag>): boolean =>
  kindsOf(part).some((kind) => tags.includes(kind));

/**
 * Adds what one content part contributes, whether it is a part of a message a
 * model was given or a part the model returned: the two are the same kinds of
 * content, so they are estimated by the same rules.
 *
 * Reasoning is counted like text; this is the one rule `ai-tokenizer` does not
 * state, because the messages it counts have no reasoning part. A kind that
 * carries meta information rather than content contributes nothing, so no case
 * below reads one.
 */
const contentContributions = (
  part: Prompt.Part | ResponseContentPart,
  contributions: Array<Contribution>,
  media: MediaRule,
): void => {
  if (!isContentTag(part.type)) return;

  const kind = kindOf[part.type];

  switch (part.type) {
    case "text":
    case "reasoning":
      contributions.push({ kind, text: part.text });
      break;
    case "tool-call": {
      contributions.push({ kind, text: part.name, call: part.id });

      const params = jsonText(part.params);

      if (params !== undefined) contributions.push({ kind, text: params, call: part.id });

      break;
    }

    case "tool-result": {
      contributions.push({ kind, text: part.id });

      const result = payloadText(part.result);

      if (result !== undefined) contributions.push({ kind, text: result });

      break;
    }

    case "file":
      contributions.push({ kind, estimate: media(part, imageSize(part.data)) });
      break;
  }
};

/**
 * What a prompt part is worth: the content of each of its messages.
 *
 * A system message carries its content directly, as text; the other messages
 * carry content parts, which {@link contentContributions} reads one by one. The
 * role of a message is not counted: it is framing a provider adds around what was
 * said rather than information the recording holds, so the kinds partition what a
 * prompt carries without a bucket for it.
 */
export const promptContributions = (part: PromptPart, media: MediaRule): Array<Contribution> => {
  const contributions: Array<Contribution> = [];

  for (const message of part.messages) {
    if (message.role === "system") {
      contributions.push({ kind: "text", text: message.content });

      continue;
    }

    for (const content of message.content) contentContributions(content, contributions, media);
  }

  return contributions;
};

/** What a response part is worth: what the one part it carries contributes. */
export const responseContributions = (
  part: ResponsePart,
  media: MediaRule,
): Array<Contribution> => {
  const contributions: Array<Contribution> = [];

  contentContributions(part.response, contributions, media);

  return contributions;
};

/** What one tool call a part carries is worth, and which call it is. */
export interface CallCount {
  /** Identifier of the call, which a tool result answers. */
  readonly id: string;
  /** Tokens the call is worth: its name and the JSON of its parameters. */
  readonly tokens: number;
}

/**
 * A part's estimated tokens, split by how each of them is estimated: the total,
 * the kind of information each of them came from, and what each call the part
 * carries is worth on its own.
 */
export interface Counted {
  /** Estimated tokens of the whole part. */
  readonly tokens: number;
  /**
   * Of those, the tokens a rule on a payload that is not text priced rather than
   * the tokenizer.
   */
  readonly mediaTokens: number;
  /** Of those, the tokens of each kind of information the part carries. */
  readonly kinds: KindTokens;
  /** What each tool call the part carries is worth, by the call's identifier. */
  readonly calls: ReadonlyArray<CallCount>;
}

/**
 * Counts what a part contributes under a tokenizer: text becomes the tokens the
 * tokenizer gives it, and a rule's estimate is added as it is.
 *
 * The tokenizer is read from the run rather than taken as an argument, so which
 * one a count is taken with is chosen where the run is provided with a layer.
 *
 * Every contribution is attributed to its kind, and the kinds partition the count
 * because {@link contentContributions} attributes every contribution it makes. A
 * contribution of a call is summed per call as well, so a part carrying several
 * calls still states what each of them is worth.
 */
export const countContributions = (
  contributions: ReadonlyArray<Contribution>,
): Effect.Effect<Counted, AiError.AiError, Tokenizer.Tokenizer> =>
  Effect.gen(function* () {
    const tokenizer = yield* Tokenizer.Tokenizer;
    const kinds = { text: 0, reasoning: 0, toolCall: 0, toolResult: 0, media: 0 };
    const calls = new Map<string, number>();

    let tokens = 0;

    for (const contribution of contributions) {
      const counted =
        "text" in contribution
          ? (yield* tokenizer.tokenize(contribution.text)).length
          : contribution.estimate;

      tokens += counted;
      kinds[contribution.kind] += counted;

      const call = "call" in contribution ? contribution.call : undefined;

      if (call !== undefined) calls.set(call, (calls.get(call) ?? 0) + counted);
    }

    return {
      tokens,
      mediaTokens: kinds.media,
      kinds,
      calls: Array.from(calls, ([id, counted]) => ({ id, tokens: counted })),
    };
  });

/** What one of the recorded kinds of part is worth, under one rule. */
export const countedOf = (
  part: CountedPart,
  media: MediaRule,
): Effect.Effect<Counted, AiError.AiError, Tokenizer.Tokenizer> =>
  countContributions(
    Predicate.isTagged("Prompt")(part)
      ? promptContributions(part, media)
      : responseContributions(part, media),
  );
