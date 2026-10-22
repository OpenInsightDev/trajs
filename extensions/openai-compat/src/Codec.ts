/**
 * Reading a trajectory as the conversations a chat completions API of an
 * OpenAI-compatible client takes.
 *
 * A trajectory holds every session that ran, in one stream of parts — see
 * `Trajectory` of `@trajs/core` — and what a chat completions API is handed is not
 * that stream: it is one conversation per session, holding the messages the
 * session's model was given and answered in the order they were produced, and what
 * the session inherited from the one it continues from. {@link makeOpenAiCompat}
 * reads a trajectory as those conversations.
 *
 * The conversations are read with `View.conversations` of `@trajs/core`, one session
 * at a time, and each of their messages is then written as this API states it. A
 * trajectory is read as its sessions with `Session.toSessions`, which is what
 * reading one here is given: a trajectory whose sessions cannot be read fails that
 * reading — an unproduced fork, or a late declaration, is what reading one fails with.
 *
 * **What is not carried**
 *
 * What a trajectory holds and no message states is left out rather than invented:
 *
 * - A model's reasoning, since this API states none per message.
 * - A tool a provider executed itself, and the result it answered with, since those
 *   are the provider's own record of a call it made — see `providerExecuted`.
 * - A file part that is not an image, and an image the API does not read — a
 *   document, a media type of the caller's own — which the API refers to in ways of
 *   its own rather than by the bytes a trajectory holds.
 * - The approval of a tool call, which is part of a handshake with the program that
 *   ran the tools rather than of the conversation the API was given.
 */

import type { OpenAiClient } from "@effect/ai-openai-compat";
import type { Trajectory } from "@trajs/core";
import { View } from "@trajs/core";
import type * as Session from "@trajs/core/Session";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect, Predicate } from "effect";
import type { Prompt } from "effect/ai";
import * as Base64 from "effect/encoding/Base64";

/**
 * A message of the chat completions API of an OpenAI-compatible client.
 *
 * @see {@link makeOpenAiCompat} for the operation that reads a trajectory as them.
 * @category models
 */
export type OpenAiCompatMessage = OpenAiClient.ChatCompletionRequestMessage;

/**
 * The messages of every session of a trajectory, keyed by the id of the session.
 *
 * @see {@link makeOpenAiCompat} for the operation that reads a trajectory as them.
 * @category models
 */
export type OpenAiCompatSessions = Record<string, OpenAiCompatMessage[]>;

/**
 * Reads the sessions of a trajectory as the conversations a chat completions API of an
 * OpenAI-compatible client takes, one conversation per session.
 *
 * **When to use**
 *
 * Use when a conversation read from a trajectory is handed to a model over an OpenAI-compatible
 * API — to continue it, or to run it against another model — rather than read in
 * `@trajs/core`'s own terms.
 *
 * **Details**
 *
 * - What it is given is what `Session.toSessions` read of a trajectory, so a trajectory is
 *   read as its sessions before it is read as conversations: one reading of it serves every
 *   session it holds ({@link Session.Sessions}).
 * - The conversation of a session holds the messages the session produced and the
 *   messages it inherited: what the sessions it continues from produced up to the
 *   part it continues from, from the root of the fork down.
 * - A prompt message is carried as the message of its own role, and the response
 *   parts of a turn as the messages they were produced as — the text and the tool
 *   calls a model answered with in one `assistant` message, and each tool result
 *   in a `tool` message of its own, which is where this API states one.
 * - A system message is left where it was produced rather than read as part of a
 *   conversation, since this API takes one anywhere.
 * - The text of a message is carried as the string it is, and the images it was
 *   given as the parts of its content, where any of them is an image.
 *
 * The effect fails with what reading the parts of a session fails with — the
 * {@link TrajectoryError} a trajectory whose parts cannot be read fails with, on top of what
 * the store they are kept in fails with — and requires the services `R` names.
 *
 * **Example** (Reading a trajectory as the messages of a call and its answer)
 *
 * ```ts import.meta.vitest
 * import { Codec } from "@trajs/extension-openai-compat"
 * import { EventKit, ExtraKit, MetricKit, Prompt, Response, Toolkit, Trajectory } from "@trajs/core"
 * import { Effect, Stream } from "effect"
 *
 * // The main session, which the parts below belong to.
 * const sessionId = Trajectory.mainSessionId
 * const config = Trajectory.config({
 *   stream: false,
 *   toolkit: Toolkit.empty,
 *   eventkit: EventKit.empty,
 *   metrickit: MetricKit.empty,
 *   extrakit: ExtraKit.empty
 * })
 *
 * const part = Trajectory.parts(config)
 *
 * // An exchange a trajectory holds: what a model was given, the tool it called for it, the
 * // result that call was answered with, and what it answered of that result.
 * const parts = [
 *   part.mainSession(),
 *   part.prompt(
 *     Prompt.make("What is the weather in Paris?"),
 *     { sessionId }
 *   ),
 *   part.response(
 *     Response.anyToolCallPart({
 *       id: "call_1",
 *       name: "weather",
 *       params: { city: "Paris" },
 *       providerExecuted: false
 *     }),
 *     { sessionId }
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
 *     ]),
 *     { sessionId }
 *   ),
 *   part.response(
 *     Response.makePart("text", { text: "It is 18°C." }),
 *     { sessionId }
 *   )
 * ]
 *
 * const trajectory = Trajectory.make(config)(Stream.fromIterable(parts))
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 * const conversations = await Effect.runPromise(Codec.makeOpenAiCompat(sessions))
 *
 * conversations[sessionId]?.map((message) => message.role) // => ["user", "assistant", "tool", "assistant"]
 * ```
 *
 * @see {@link OpenAiCompatSessions} for the messages it reads to.
 * @see {@link View.conversations} for the conversations it writes out.
 * @see {@link Session.toSessions} for the sessions it is given.
 * @category constructors
 */
export const makeOpenAiCompat = <Config extends Trajectory.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): Effect.Effect<OpenAiCompatSessions, E | TrajectoryError, R> =>
  View.conversations(sessions).pipe(
    Effect.map((sessions) => {
      const encoded: OpenAiCompatSessions = {};

      for (const [id, messages] of Object.entries(sessions)) {
        encoded[id] = openAiCompatMessages(messages);
      }

      return encoded;
    }),
  );

/** The text of the parts given. */
const textOf = (parts: ReadonlyArray<Prompt.Part>): string => {
  let text = "";

  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }

  return text;
};

/** The images of the parts given, which this model states as file parts. */
const imagesOf = (parts: ReadonlyArray<Prompt.Part>): ReadonlyArray<Prompt.FilePart> => {
  const images: Prompt.FilePart[] = [];

  for (const part of parts) {
    if (part.type === "file" && part.mediaType.startsWith("image/")) images.push(part);
  }

  return images;
};

/**
 * The result of a tool as the text a provider is handed it as: the string a result
 * already is, and the JSON of every other value.
 */
const resultText = (result: Prompt.ToolResultPart["result"]): string =>
  Predicate.isString(result) ? result : (JSON.stringify(result) ?? String(result));

/**
 * The media type an image is stated as: the one the part produces, and JPEG where it
 * produces only that the part is an image.
 */
const mediaTypeOf = (part: Prompt.FilePart): string =>
  part.mediaType === "image/*" ? "image/jpeg" : part.mediaType;

/** A location or a data URL an image part already states, which this API takes as one. */
const referenced = /^(data:|https?:\/\/)/i;

const openAiCompatMessages = (messages: View.Conversation): OpenAiCompatMessage[] => {
  const encoded: OpenAiCompatMessage[] = [];

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
const openAiAssistantMessages = (
  parts: ReadonlyArray<Prompt.AssistantMessagePart>,
): OpenAiCompatMessage[] => {
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
const openAiToolMessages = (parts: ReadonlyArray<Prompt.Part>): OpenAiCompatMessage[] => {
  const messages: OpenAiCompatMessage[] = [];

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
