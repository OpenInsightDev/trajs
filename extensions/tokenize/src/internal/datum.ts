/**
 * The count one part of a trajectory is recorded as.
 *
 * Counting a part yields the numbers it is worth, and this is what those numbers
 * become: the datum of one member of `Tokens` — the buckets of a prompt, or the
 * count of the kind of response part it is. The two steps are apart because the
 * first is what a tokenizer answers and the second is what a recording states, so
 * a change to the shapes does not reach into the counting.
 */

import { Option, Predicate } from "effect";

import type { Counted } from "#/internal/count.ts";
import type { CountedPart, ResponsePart } from "#/internal/part.ts";
import {
  FileTokens,
  PromptTokens,
  ReasoningTokens,
  type TokenCount,
  TextTokens,
  ToolCallTokens,
  ToolResultTokens,
} from "#/Tokens.ts";

/**
 * The calls a part has not been seen to make, for counting one part on its own.
 *
 * A part counted without the trajectory it belongs to has no call to pair a
 * result with, so what a result's call is worth is not stated — see
 * {@link toolResultCount}.
 */
export const noCalls: ReadonlyMap<string, number> = new Map();

/** The count of a prompt part: every kind of information it carries, and the total. */
export const promptCount = (counted: Counted): PromptTokens =>
  PromptTokens.make({
    text: counted.kinds.text,
    reasoning: counted.kinds.reasoning,
    toolCall: counted.kinds.toolCall,
    toolResult: counted.kinds.toolResult,
    media: counted.kinds.media,
    tokens: counted.tokens,
  });

/**
 * The count of a response part that is a tool result.
 *
 * The call the result answers is not counted here: `toolCallTokens` is handed in as
 * what the call and the result are worth together, which is what a reader of the
 * result alone cannot know — see {@link responseDatum}.
 */
export const toolResultCount = (counted: Counted, toolCallTokens: number): ToolResultTokens =>
  ToolResultTokens.make({
    tokens: counted.tokens,
    mediaTokens: counted.mediaTokens,
    toolCallTokens,
  });

/** What a tool result's call and the result are worth together, when the call is known. */
const pairedTokens = (
  id: string,
  counted: Counted,
  calls: ReadonlyMap<string, number>,
): number | undefined => {
  const call = calls.get(id);

  return call === undefined ? undefined : call + counted.tokens;
};

/**
 * The count of a response part, as the schema of the kind of part it is, or
 * nothing when no count is taken from it.
 *
 * A response part is one message part, so the kind of count it is recorded as is
 * the `type` of that part. Two kinds give back nothing: a kind that carries no
 * content — the source of a response, its metadata, its finish, the approval of a
 * call — because nothing a tokenizer answers for is in it; and a tool result,
 * whose count states what the call it answers is worth beside it, because that is
 * read from the recording the result belongs to rather than from the result alone.
 */
export const responseDatum = (
  part: ResponsePart,
  counted: Counted,
  calls: ReadonlyMap<string, number>,
): Option.Option<TokenCount> => {
  const own = { tokens: counted.tokens, mediaTokens: counted.mediaTokens };

  switch (part.response.type) {
    case "text":
      return Option.some(TextTokens.make(own));
    case "reasoning":
      return Option.some(ReasoningTokens.make(own));
    case "tool-call":
      return Option.some(ToolCallTokens.make(own));
    case "file":
      return Option.some(FileTokens.make(own));
    case "tool-result": {
      const pair = pairedTokens(part.response.id, counted, calls);

      return pair === undefined ? Option.none() : Option.some(toolResultCount(counted, pair));
    }

    default:
      return Option.none();
  }
};

/**
 * The count one part of a trajectory is recorded as, or nothing when the part is
 * one no count is taken from.
 *
 * The calls the parts before this one made are given so that a tool result can
 * state what the call it answers is worth — see `Metrics` for the producer that
 * carries them, and {@link noCalls} for a count taken of one part alone.
 */
export const countOf = (
  part: CountedPart,
  counted: Counted,
  calls: ReadonlyMap<string, number>,
): Option.Option<TokenCount> =>
  Predicate.isTagged("Prompt")(part)
    ? Option.some(promptCount(counted))
    : responseDatum(part, counted, calls);
