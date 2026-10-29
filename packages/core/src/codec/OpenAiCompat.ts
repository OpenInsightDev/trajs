/**
 * Session conversations for OpenAI-compatible Chat Completions APIs.
 *
 * {@link make} converts a session tree into message arrays keyed by session id.
 * Tool results become separate `tool` messages.
 *
 * @stability stable
 */

import type { OpenAiClient } from "@effect/ai-openai-compat";
import { Effect, Predicate } from "effect";
import type { Prompt } from "effect/ai";
import * as Base64 from "effect/encoding/Base64";

import { imagesOf, mediaTypeOf, resultText, textOf } from "#/codec/internal/prompt.ts";
import * as Config from "#/Config.ts";
import * as Session from "#/Session.ts";
import * as View from "#/view/index.ts";

/**
 * An OpenAI-compatible Chat Completions input message.
 *
 * @see {@link make} for conversion from session parts.
 * @stability stable
 * @category models
 */
export type Message = OpenAiClient.ChatCompletionRequestMessage;

/**
 * OpenAI-compatible message arrays keyed by session id.
 *
 * @see {@link make} for converting a session tree.
 * @stability stable
 * @category models
 */
export type Sessions = Record<string, Message[]>;

/**
 * Converts every session in a tree into OpenAI-compatible Chat Completions messages.
 *
 * **When to use**
 *
 * Use to replay recorded context through an OpenAI-compatible model API.
 *
 * **Details**
 *
 * Each conversation includes inherited context through {@link Session.stream}.
 * System messages retain their position among conversation messages.
 * Assistant text and tool calls share one assistant message.
 * Each tool result becomes a separate tool message.
 * User images become image URL content, using data URLs for embedded bytes.
 *
 * **Gotchas**
 *
 * Reasoning, provider-executed calls and results, approvals, and non-image files are omitted.
 * Empty user content and assistant content without text, calls, or results are omitted.
 * Tool results are converted to text rather than multimodal content.
 * Conversion retains every session's complete conversation in memory.
 * Session reads scan the cached trajectory and can repeat inherited context.
 *
 * **Example** (Converting an OpenAI-compatible tool exchange)
 *
 * ```ts import.meta.vitest
 * import { OpenAiCompat } from "@trajs/core/codec"
 * import { Cache, Config, Prompt, Response, Session, Trajectory } from "@trajs/core"
 * import { Effect, Stream } from "effect"
 *
 * const config = Config.config()
 * const part = Trajectory.parts(config)
 *
 * const parts = [
 *   part.prompt(
 *     Prompt.make("What is the weather in Paris?")
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
 *   Effect.flatMap(OpenAiCompat.make),
 *   Effect.provide(Cache.layer()),
 * ))
 *
 * conversations[Trajectory.mainSessionId]?.map((message) => message.role) // => ["user", "assistant", "tool", "assistant"]
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

      encoded[session.id] = openAiCompatMessages(prompt.content);
    }

    return encoded;
  });

/** A location or a data URL an image part already states, which this API takes as one. */
const referenced = /^(data:|https?:\/\/)/i;

const openAiCompatMessages = (messages: ReadonlyArray<Prompt.Message>): Message[] => {
  const encoded: Message[] = [];

  for (const message of messages) {
    switch (message.role) {
      case "system":
        encoded.push({ role: "system", content: message.content });
        break;

      case "user": {
        const content = openAiUserContent(message.content);

        if (content !== undefined) encoded.push({ role: "user", content });
        break;
      }

      case "assistant":
        encoded.push(...openAiAssistantMessages(message.content));
        break;

      case "tool":
        encoded.push(...openAiToolMessages(message.content));
        break;
    }
  }

  return encoded;
};

/** The content of a user message, or nothing where it states none. */
const openAiUserContent = (
  parts: ReadonlyArray<Prompt.UserMessagePart>,
): string | ReadonlyArray<OpenAiContentPart> | undefined => {
  const text = textOf(parts);
  const images = imagesOf(parts);

  if (images.length === 0) {
    return text === "" ? undefined : text;
  }

  // A content of parts is what states more than the text of a message, since a
  // string is the one form every model of this API reads.
  const content: OpenAiContentPart[] = [];

  if (text !== "") content.push({ type: "text", text });

  for (const image of images) content.push(openAiImage(image));

  return content;
};

/** The part an image of a message is carried as. */
const openAiImage = (part: Prompt.FilePart): OpenAiImagePart => {
  const data = part.data;

  if (data instanceof URL) return openAiImageUrl(data.toString());

  if (Predicate.isString(data)) {
    return openAiImageUrl(
      referenced.test(data) ? data : `data:${mediaTypeOf(part)};base64,${data}`,
    );
  }

  return openAiImageUrl(`data:${mediaTypeOf(part)};base64,${Base64.encode(data)}`);
};

const openAiImageUrl = (url: string): OpenAiImagePart => ({
  type: "image_url",
  image_url: { url },
});

/**
 * The messages an assistant message is stated as: what the model answered with,
 * and a `tool` message for each result it stated of a call no provider ran itself.
 */
const openAiAssistantMessages = (parts: ReadonlyArray<Prompt.AssistantMessagePart>): Message[] => {
  const text = textOf(parts);
  const toolCalls: OpenAiToolCall[] = [];

  for (const part of parts) {
    if (part.type === "tool-call" && !part.providerExecuted) toolCalls.push(openAiToolCall(part));
  }

  const results = openAiToolMessages(parts);

  if (text === "" && toolCalls.length === 0 && results.length === 0) return [];

  const assistant: OpenAiAssistantMessage = {
    role: "assistant",
    content: text === "" ? null : text,
  };

  if (toolCalls.length > 0) assistant.tool_calls = toolCalls;

  return [assistant, ...results];
};

/** The tool call a message states, as a chat completions API takes it. */
const openAiToolCall = (part: Prompt.ToolCallPart): OpenAiToolCall => ({
  id: part.id,
  type: "function",
  function: { name: part.name, arguments: JSON.stringify(part.params) ?? "{}" },
});

/** The messages the tool results of a message are stated as, one per result. */
const openAiToolMessages = (parts: ReadonlyArray<Prompt.Part>): Message[] => {
  const messages: Message[] = [];

  for (const part of parts) {
    if (part.type === "tool-result" && !part.providerExecuted) {
      messages.push({ role: "tool", tool_call_id: part.id, content: resultText(part.result) });
    }
  }

  return messages;
};

/** An assistant message as a chat completions API takes one. */
interface OpenAiAssistantMessage {
  readonly role: "assistant";
  readonly content: string | null;
  tool_calls?: ReadonlyArray<OpenAiToolCall>;
}

/** A part of the content of a chat completions message. */
type OpenAiContentPart = OpenAiClient.ChatCompletionContentPart;

/** The tool call an assistant message of a chat completions API states. */
type OpenAiToolCall = OpenAiClient.ChatCompletionRequestToolCall;

/** An image of a chat completions message, as this API refers to one. */
type OpenAiImagePart = Extract<OpenAiContentPart, { type: "image_url" }>;
