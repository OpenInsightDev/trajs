/**
 * Session conversations for the Anthropic Messages API.
 *
 * {@link make} converts a session tree into API conversations keyed by session id.
 * {@link Conversation} keeps system instructions separate from user and assistant messages.
 *
 * @stability stable
 */

import type { Generated } from "@effect/ai-anthropic";
import { Effect, Predicate } from "effect";
import type { Prompt } from "effect/ai";
import * as Base64 from "effect/encoding/Base64";

import { imagesOf, mediaTypeOf, resultText, textOf } from "#/codec/internal/prompt.ts";
import * as Config from "#/Config.ts";
import * as Session from "#/Session.ts";
import * as View from "#/view/index.ts";

/**
 * An Anthropic API input message without system instructions.
 *
 * @see {@link Conversation} for messages with separate system instructions.
 * @stability stable
 * @category models
 */
export type Message = Generated.BetaInputMessage;

/**
 * Anthropic input messages with optional system instructions.
 *
 * **Details**
 *
 * Conversion places all system messages in `system` as text blocks.
 * Without system messages, `system` is `undefined`.
 *
 * @see {@link make} for conversion rules and omitted content.
 * @stability stable
 * @category models
 */
export type Conversation = Readonly<{
  system?: string | ReadonlyArray<Generated.BetaRequestTextBlock>;
  messages: ReadonlyArray<Message>;
}>;

/**
 * Anthropic conversations keyed by session id.
 *
 * @see {@link make} for converting a session tree.
 * @stability stable
 * @category models
 */
export type Sessions = Record<string, Conversation>;

/**
 * Converts every session in a tree into an Anthropic API conversation.
 *
 * **When to use**
 *
 * Use to replay recorded context through the Anthropic Messages API.
 *
 * **Details**
 *
 * Each conversation includes inherited context through {@link Session.stream}.
 * System messages become separate system text blocks.
 * Tool results become user content blocks.
 * Adjacent messages with the same role are merged.
 * Text and user images are retained; tool results become text content.
 *
 * **Gotchas**
 *
 * Reasoning, provider-executed calls and results, approvals, and non-image files are omitted.
 * Embedded images support JPEG, PNG, GIF, and WebP.
 * Conversion retains every session's complete conversation in memory.
 * Session reads scan the cached trajectory and can repeat inherited context.
 *
 * **Example** (Converting an Anthropic tool exchange)
 *
 * ```ts import.meta.vitest
 * import { Anthropic } from "@trajs/core/codec"
 * import { Cache, Config, Prompt, Response, Session, Trajectory } from "@trajs/core"
 * import { Effect, Stream } from "effect"
 *
 * const config = Config.config()
 * const part = Trajectory.parts(config)
 *
 * const parts = [
 *   part.prompt(
 *     Prompt.fromMessages([
 *       Prompt.makeMessage("system", { content: "Answer in one sentence." }),
 *       Prompt.makeMessage("user", {
 *         content: [Prompt.makePart("text", { text: "What is the weather in Paris?" })]
 *       })
 *     ])
 *   ),
 *   part.response(
 *     Response.anyToolCallPart({
 *       id: "call_1",
 *       name: "weather",
 *       params: { city: "Paris" },
 *     })
 *   ),
 *   part.prompt(
 *     Prompt.fromMessages([
 *       Prompt.makeMessage("tool", {
 *         content: [
 *           Prompt.makePart("tool-result", {
 *             id: "call_1",
 *             name: "weather",
 *             isFailure: false,
 *             result: "18°C",
 *             providerExecuted: false
 *           })
 *         ]
 *       })
 *     ])
 *   ),
 *   part.response(
 *     Response.makePart("text", { text: "It is 18°C." })
 *   )
 * ]
 *
 * const trajectory = Trajectory.make(config)(Stream.fromIterable(parts))
 *
 * const conversations = await Effect.runPromise(Session.main(trajectory).pipe(
 *   Effect.flatMap(Anthropic.make),
 *   Effect.provide(Cache.layer()),
 * ))
 * const conversation = conversations[Trajectory.mainSessionId]
 *
 * conversation?.messages.map((message) => message.role) // => ["user", "assistant", "user", "assistant"]
 * Array.isArray(conversation?.system) ? conversation.system.length : 0 // => 1
 * ```
 *
 * @see {@link Sessions} for the result map.
 * @see {@link View.prompt} for a core prompt without API conversion.
 * @see {@link Session.main} for session discovery and validation.
 * @stability stable
 * @category converting
 */
export const make = <Config extends Config.AnyConfig, E, R>(
  main: Session.MainSession<Config, E, R>,
): Effect.Effect<Sessions, E, R> =>
  Effect.gen(function* () {
    const encoded: Sessions = {};

    for (const session of Session.all(main)) {
      const prompt = yield* View.prompt(Session.stream(session));

      encoded[session.id] = anthropicConversation(prompt.content);
    }

    return encoded;
  });

/** A location an image part names, as opposed to the bytes it holds, which the API reads as an image's URL. */
const located = /^https?:\/\//i;

const anthropicConversation = (messages: ReadonlyArray<Prompt.Message>): Conversation => {
  const system: Generated.BetaRequestTextBlock[] = [];
  const entries: AnthropicEntry[] = [];

  for (const message of messages) {
    switch (message.role) {
      case "system":
        system.push({ type: "text", text: message.content });
        break;

      case "user":
        appendAnthropic(entries, "user", anthropicUserBlocks(message.content));
        break;

      case "assistant":
        appendAnthropic(entries, "assistant", anthropicAssistantBlocks(message.content));
        // A tool result a model stated of a call that ran is stated on the user's
        // side of the conversation, which is where the API takes one.
        appendAnthropic(entries, "user", anthropicToolResultBlocks(message.content));
        break;

      case "tool":
        appendAnthropic(entries, "user", anthropicToolResultBlocks(message.content));
        break;
    }
  }

  return { system: system.length === 0 ? undefined : system, messages: entries };
};

/**
 * Adds blocks to the last message of a role, opening a message where the last one
 * is of another role: the API states the roles of a conversation alternating, so
 * two messages of a role that follow one another are one message.
 */
const appendAnthropic = (
  entries: AnthropicEntry[],
  role: AnthropicEntry["role"],
  blocks: ReadonlyArray<AnthropicBlock>,
): void => {
  if (blocks.length === 0) return;

  const last = entries.at(-1);

  if (last === undefined || last.role !== role) {
    entries.push({ role, content: [...blocks] });

    return;
  }

  for (const block of blocks) last.content.push(block);
};

/** The blocks a user message is stated as. */
const anthropicUserBlocks = (
  parts: ReadonlyArray<Prompt.UserMessagePart>,
): ReadonlyArray<AnthropicBlock> => {
  const blocks: AnthropicBlock[] = [];
  const text = textOf(parts);

  if (text !== "") blocks.push({ type: "text", text });

  for (const image of imagesOf(parts)) {
    const block = anthropicImage(image);

    if (block !== undefined) blocks.push(block);
  }

  return blocks;
};

/** The blocks an assistant message is stated as: its text, and the calls it made. */
const anthropicAssistantBlocks = (
  parts: ReadonlyArray<Prompt.AssistantMessagePart>,
): ReadonlyArray<AnthropicBlock> => {
  const blocks: AnthropicBlock[] = [];
  const text = textOf(parts);

  if (text !== "") blocks.push({ type: "text", text });

  for (const part of parts) {
    if (part.type === "tool-call" && !part.providerExecuted) blocks.push(anthropicToolUse(part));
  }

  return blocks;
};

/** The blocks the tool results of a message are stated as, one per result. */
const anthropicToolResultBlocks = (
  parts: ReadonlyArray<Prompt.Part>,
): ReadonlyArray<AnthropicBlock> => {
  const blocks: AnthropicBlock[] = [];

  for (const part of parts) {
    if (part.type === "tool-result" && !part.providerExecuted)
      blocks.push(anthropicToolResult(part));
  }

  return blocks;
};

/**
 * An image of a user message, as the API refers to one, or nothing where it is an
 * image the API does not read.
 */
const anthropicImage = (part: Prompt.FilePart): AnthropicImage | undefined => {
  const data = part.data;

  if (data instanceof URL) return anthropicImageUrl(data.toString());

  if (Predicate.isString(data) && located.test(data)) return anthropicImageUrl(data);

  const mediaType = anthropicImageType(mediaTypeOf(part));

  if (mediaType === undefined) return undefined;

  return anthropicImageData(
    mediaType,
    Predicate.isString(data) ? data.replace(/^data:[^;]+;base64,/, "") : Base64.encode(data),
  );
};

/** The media type an image is read at, or nothing where the API reads no image at it. */
const anthropicImageType = (mediaType: string): AnthropicImageType | undefined => {
  switch (mediaType) {
    case "image/gif":
    case "image/jpeg":
    case "image/png":
    case "image/webp":
      return mediaType;
    default:
      return undefined;
  }
};

const anthropicImageUrl = (url: string): AnthropicImage => ({
  type: "image",
  source: { type: "url", url },
});

const anthropicImageData = (mediaType: AnthropicImageType, data: string): AnthropicImage => ({
  type: "image",
  source: { type: "base64", media_type: mediaType, data },
});

/** The tool call a message states, as the API takes one. */
const anthropicToolUse = (part: Prompt.ToolCallPart): AnthropicToolUse => ({
  type: "tool_use",
  id: part.id,
  name: part.name,
  // SAFETY: a tool call's parameters are the parameters the tool's own schema
  // decoded, which is the object the API states an input as.
  input: part.params as AnthropicToolUse["input"],
});

/** The tool result a message states, as the API takes one. */
const anthropicToolResult = (part: Prompt.ToolResultPart): AnthropicToolResult => ({
  type: "tool_result",
  tool_use_id: part.id,
  content: resultText(part.result),
  is_error: part.isFailure,
});

/** One message of an Anthropic conversation, as the blocks it states. */
interface AnthropicEntry {
  readonly role: "assistant" | "user";
  readonly content: AnthropicBlock[];
}

/** A block of the content of an Anthropic message. */
type AnthropicBlock = Generated.BetaInputContentBlock;

/** An image block of an Anthropic message. */
type AnthropicImage = Extract<AnthropicBlock, { type: "image" }>;

/** The media type an image block is read at. */
type AnthropicImageType = Extract<AnthropicImage["source"], { type: "base64" }>["media_type"];

/** A tool use block of an Anthropic message. */
type AnthropicToolUse = Extract<AnthropicBlock, { type: "tool_use" }>;

/** A tool result block of an Anthropic message. */
type AnthropicToolResult = Extract<AnthropicBlock, { type: "tool_result" }>;
