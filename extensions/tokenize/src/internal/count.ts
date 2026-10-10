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
 */

import { Predicate } from "effect";
import type { Prompt } from "effect/ai";
import type { Trajectory } from "@trajs/core";
import { imageSize } from "#/internal/image.ts";
import type { MediaRule } from "#/internal/media.ts";

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

/**
 * Adds what one content part contributes, whether it is a part of a message a
 * model was given or a part the model returned: the two are the same kinds of
 * content, so they are estimated by the same rules.
 *
 * Reasoning is counted like text; this is the one rule `ai-tokenizer` does not
 * state, because the messages it counts have no reasoning part. Everything else
 * it has no rule for — the approval parts, a source, response metadata and a
 * finish — contributes nothing.
 */
const contentContributions = (
  part: Prompt.Part | RecordedResponsePart,
  contributions: Array<Contribution>,
  media: MediaRule,
): void => {
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
    case "tool-approval-request":
    case "tool-approval-response":
    case "source":
    case "response-metadata":
    case "finish":
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
