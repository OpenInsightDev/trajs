import type { OpenAiClient } from "@effect/ai-openai-compat";
import { Effect, Predicate, Stream } from "effect";
import type { Prompt, Tool } from "effect/ai";
import { Base64 } from "effect/encoding";
import type { ChatCompletionMessage, ChatCompletionSessions } from "#/Codec.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

const textPart = (text: string): OpenAiClient.ChatCompletionContentPart => ({ type: "text", text });

const fileUrl = (data: Prompt.FilePart["data"], mediaType: string): string => {
  if (Predicate.isString(data)) {
    return data;
  }

  if (data instanceof URL) {
    return data.toString();
  }

  return `data:${mediaType};base64,${Base64.encode(data)}`;
};

// Chat completions only carry images inline, so a media type that is not an
// image has no content part to map to and is reported as absent.
const imagePart = (part: Prompt.FilePart): OpenAiClient.ChatCompletionContentPart | undefined => {
  if (!part.mediaType.startsWith("image/")) {
    return undefined;
  }

  return { type: "image_url", image_url: { url: fileUrl(part.data, part.mediaType) } };
};

const userContent = (
  parts: ReadonlyArray<Prompt.UserMessagePart>,
): string | ReadonlyArray<OpenAiClient.ChatCompletionContentPart> => {
  const content: OpenAiClient.ChatCompletionContentPart[] = [];
  let text = "";
  let onlyText = true;

  for (const part of parts) {
    if (part.type === "text") {
      text += part.text;
      content.push(textPart(part.text));

      continue;
    }

    const image = imagePart(part);

    if (image === undefined) {
      continue;
    }

    onlyText = false;
    content.push(image);
  }

  return onlyText ? text : content;
};

const toolCall = (part: Prompt.ToolCallPart): OpenAiClient.ChatCompletionRequestToolCall => ({
  id: part.id,
  type: "function",
  function: { name: part.name, arguments: JSON.stringify(part.params) ?? "" },
});

const toolResult = (part: Prompt.ToolResultPart): ChatCompletionMessage => ({
  role: "tool",
  tool_call_id: part.id,
  content: Predicate.isString(part.result) ? part.result : (JSON.stringify(part.result) ?? ""),
});

const assistantMessage = (
  text: string,
  toolCalls: ReadonlyArray<OpenAiClient.ChatCompletionRequestToolCall>,
): ChatCompletionMessage => {
  const content = text.length > 0 ? text : null;

  if (toolCalls.length === 0) {
    return { role: "assistant", content };
  }

  return { role: "assistant", content, tool_calls: toolCalls };
};

// A provider-executed tool result is recorded in the assistant message, but
// chat completions expect it as its own `tool` message, so it is split out.
const assistantContent = (
  parts: ReadonlyArray<Prompt.AssistantMessagePart>,
): ChatCompletionMessage[] => {
  const toolCalls: OpenAiClient.ChatCompletionRequestToolCall[] = [];
  const results: ChatCompletionMessage[] = [];
  let text = "";

  for (const part of parts) {
    switch (part.type) {
      case "text":
        text += part.text;
        break;
      case "tool-call":
        toolCalls.push(toolCall(part));
        break;
      case "tool-result":
        results.push(toolResult(part));
        break;
      // Reasoning, file and approval parts have no chat completion equivalent.
      case "reasoning":
      case "file":
      case "tool-approval-request":
        break;
    }
  }

  if (text.length === 0 && toolCalls.length === 0) {
    return results;
  }

  return [assistantMessage(text, toolCalls), ...results];
};

const toolContent = (parts: ReadonlyArray<Prompt.ToolMessagePart>): ChatCompletionMessage[] => {
  const messages: ChatCompletionMessage[] = [];

  for (const part of parts) {
    if (part.type === "tool-result") {
      messages.push(toolResult(part));
    }
  }

  return messages;
};

const messagesOf = (message: Prompt.Message): ChatCompletionMessage[] => {
  switch (message.role) {
    case "system":
      return [{ role: "system", content: message.content }];
    case "user":
      return [{ role: "user", content: userContent(message.content) }];
    case "assistant":
      return assistantContent(message.content);
    case "tool":
      return toolContent(message.content);
  }
};

// A session's messages are folded from its own parts, in the order they were
// recorded: each prompt contributes the messages the model was given and the
// responses that follow it contribute what the model returned.
const sessionMessages = <Tools extends Record<string, Tool.Any>>(
  parts: ReadonlyArray<Trajectory.Part<Tools>>,
): Effect.Effect<ChatCompletionMessage[], TrajectoryError> =>
  Trajectory.prompt(Stream.fromIterable(parts)).pipe(
    Effect.map((prompt) => prompt.content.flatMap(messagesOf)),
  );

const groupBySession = <Tools extends Record<string, Tool.Any>>(
  parts: ReadonlyArray<Trajectory.Part<Tools>>,
): Map<string, Trajectory.Part<Tools>[]> => {
  const sessions = new Map<string, Trajectory.Part<Tools>[]>();

  for (const part of parts) {
    const id = part.session ?? "";
    const group = sessions.get(id);

    if (group === undefined) {
      sessions.set(id, [part]);
    } else {
      group.push(part);
    }
  }

  return sessions;
};

/** Converts a trajectory into the chat completion messages of each of its sessions. */
export const makeChatCompletion = Effect.fn("Codec.makeChatCompletion")(function* <
  Tools extends Record<string, Tool.Any>,
  E,
  R,
>(
  trajectory: Trajectory.Trajectory<Tools, E, R>,
): Effect.fn.Return<ChatCompletionSessions, E | TrajectoryError, R> {
  const parts = Array.from(yield* Stream.runCollect(trajectory));
  const sessions: ChatCompletionSessions = {};

  for (const [id, group] of groupBySession(parts)) {
    sessions[id] = yield* sessionMessages(group);
  }

  return sessions;
});
