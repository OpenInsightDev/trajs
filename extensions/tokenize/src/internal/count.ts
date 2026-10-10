/**
 * What a recorded trajectory part is worth, before an encoding is applied.
 *
 * The estimate follows `ai-tokenizer`'s `sdk.ts`: a part contributes the text it
 * carries, a tool call contributes its name and the JSON of its parameters, a
 * tool result contributes its identifier and its result, and a payload that is
 * not text contributes a fixed number of tokens. The overheads a model's own
 * token configuration adds — the base overhead of a request, a per-message or
 * per-tool overhead, the content multiplier, and the cost of a tool's schema —
 * are not part of it, because trajs records no such configuration.
 *
 * Text is what a tokenizer can actually answer for. A payload that is not text is
 * only estimated, because what it costs is a property of the model that reads it
 * and of the payload's own pixels, not of the encoding: the rule a caller names
 * decides, and `media.ts` holds the families.
 *
 * Counting a part is counting its contributions: text becomes the tokens the
 * encoding gives it, a rule's estimate is added as it is, and the two are kept
 * apart in {@link Counted}, so that an estimate can state how much of its count a
 * rule priced rather than the encoding.
 */

import { Effect, Predicate } from "effect";
import type { Prompt } from "effect/ai";
import type { Trajectory } from "@trajs/core";
import { imageSize } from "#/internal/image.ts";
import type { MediaRule } from "#/internal/media.ts";
import type * as Tokenizer from "#/Tokenizer.ts";

/**
 * What one part is worth before an encoding is applied: text to count under the
 * encoding, or a fixed estimate for a payload that is not text.
 */
export type Contribution = string | number;

const add = (
  contributions: Array<Contribution>,
  contribution: string | number | undefined,
): void => {
  if (contribution !== undefined) contributions.push(contribution);
};

/** The JSON text of a payload, or nothing when the payload is absent. */
const jsonText = <Payload>(payload: Payload): string | undefined =>
  Predicate.isNullish(payload) ? undefined : JSON.stringify(payload);

/** The text of a payload: a string as it is, anything else as JSON. */
const payloadText = <Payload>(payload: Payload): string | undefined =>
  Predicate.isString(payload) ? payload : jsonText(payload);

/** The content part a recorded response part carries. */
type RecordedResponsePart = Trajectory.AnyResponsePart["response"];

/** The kind of every message part a prompt message or a recorded response part declares. */
type AnyPartTag = Prompt.Part["type"] | RecordedResponsePart["type"];

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
const contentTags = ["text", "reasoning", "tool-call", "tool-result", "file"] as const;

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

const kindsOf = (
  part: Trajectory.PromptPart | Trajectory.AnyResponsePart,
): ReadonlyArray<PartTag> =>
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
export const carriesAnyOf = (
  part: Trajectory.PromptPart | Trajectory.AnyResponsePart,
  tags: ReadonlyArray<PartTag>,
): boolean => kindsOf(part).some((kind) => tags.includes(kind));

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
  part: Prompt.Part | RecordedResponsePart,
  contributions: Array<Contribution>,
  media: MediaRule,
): void => {
  if (!isContentTag(part.type)) return;

  switch (part.type) {
    case "text":
    case "reasoning":
      add(contributions, part.text);
      break;
    case "tool-call":
      add(contributions, part.name);
      add(contributions, jsonText(part.params));
      break;
    case "tool-result":
      add(contributions, part.id);
      add(contributions, payloadText(part.result));
      break;
    case "file":
      add(contributions, media(part, imageSize(part.data)));
      break;
  }
};

/**
 * What a prompt part is worth: the role of each message, then its content.
 *
 * A system message carries its content directly; the other messages carry
 * content parts, which {@link contentContributions} reads one by one.
 */
export const promptContributions = (
  part: Trajectory.PromptPart,
  media: MediaRule,
): Array<Contribution> => {
  const contributions: Array<Contribution> = [];

  for (const message of part.messages) {
    add(contributions, message.role);

    if (message.role === "system") {
      add(contributions, message.content);

      continue;
    }

    for (const content of message.content) contentContributions(content, contributions, media);
  }

  return contributions;
};

/** What a response part is worth: what the one part it carries contributes. */
export const responseContributions = (
  part: Trajectory.AnyResponsePart,
  media: MediaRule,
): Array<Contribution> => {
  const contributions: Array<Contribution> = [];

  contentContributions(part.response, contributions, media);

  return contributions;
};

/**
 * A part's estimated tokens, split by how each of them is estimated: the total,
 * and the part of it a rule priced.
 */
export interface Counted {
  /** Estimated tokens of the whole part. */
  readonly tokens: number;
  /**
   * Of those, the tokens a rule on a payload that is not text priced rather than
   * the encoding.
   */
  readonly mediaTokens: number;
}

/**
 * Counts what a part contributes under an encoding: text becomes the tokens the
 * encoding gives it, and a rule's estimate is added as it is.
 *
 * Every contribution that is not text is the one a rule priced, which is what the
 * split rests on: `contentContributions` adds no number of its own.
 */
export const countContributions = (
  tokenizer: Tokenizer.Service,
  contributions: ReadonlyArray<Contribution>,
): Effect.Effect<Counted, Tokenizer.DisallowedSpecialToken> =>
  Effect.gen(function* () {
    let tokens = 0;
    let mediaTokens = 0;

    for (const contribution of contributions) {
      if (Predicate.isString(contribution)) {
        tokens += yield* tokenizer.count(contribution);
      } else {
        tokens += contribution;
        mediaTokens += contribution;
      }
    }

    return { tokens, mediaTokens };
  });

/** What one of the recorded kinds of part is worth, under one rule. */
export const countedOf = (
  part: Trajectory.PromptPart | Trajectory.AnyResponsePart,
  tokenizer: Tokenizer.Service,
  media: MediaRule,
): Effect.Effect<Counted, Tokenizer.DisallowedSpecialToken> =>
  countContributions(
    tokenizer,
    Predicate.isTagged("Prompt")(part)
      ? promptContributions(part, media)
      : responseContributions(part, media),
  );
