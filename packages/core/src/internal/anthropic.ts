/**
 * Writes a conversation in the message shape of Anthropic's Messages API.
 *
 * The conversion mirrors `prepareMessages` and `groupMessages` of
 * `@effect/ai-anthropic`, the Anthropic language model of the Effect AI SDK, so
 * a recording is read as the request the provider itself would build. That
 * implementation is private to the provider, so its rules are reimplemented
 * here against a pure message list rather than reused: provider-only concerns
 * (cache control, citations, provider-executed server tools, tool-name mapping
 * and beta headers) are left out, and a part the Messages API cannot express is
 * dropped rather than reported, because exporting a recording is best-effort.
 *
 * The mirror is not exact where the provider relies on request-time state:
 * every system instruction is hoisted into the top-level `system` field, so a
 * system instruction recorded mid-conversation is not inlined, and a
 * provider-executed tool call or result has no server-tool equivalent and is
 * dropped.
 */

import type { Generated } from "@effect/ai-anthropic";
import type { Schema } from "effect";
import { Effect, Predicate } from "effect";
import type { Prompt, Tool } from "effect/ai";
import { Base64 } from "effect/encoding";
import type { AnthropicConversation, AnthropicMessage, AnthropicSessions } from "#/Codec.ts";
import type * as Extension from "#/Extension.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import * as conversation from "#/internal/conversation.ts";

/** A text block accepted by the top-level `system` field. */
type SystemBlock = Generated.BetaRequestTextBlock;

/** A content block accepted inside an input message. */
type ContentBlock = Generated.BetaInputContentBlock;

/** The media types the Messages API accepts inline as an image. */
const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

const HTTP_URL = /^https?:\/\//i;

/** A run of consecutive messages of one role, read as Anthropic groups them. */
type ContentGroup =
  | { readonly type: "system"; readonly messages: Prompt.SystemMessage[] }
  | { readonly type: "assistant"; readonly messages: Prompt.AssistantMessage[] }
  | { readonly type: "user"; readonly messages: (Prompt.UserMessage | Prompt.ToolMessage)[] };

// Mirrors `groupMessages` of `@effect/ai-anthropic`: consecutive messages of the
// same role become one group, and a `tool` message joins the `user` group that
// precedes it because Anthropic carries tool results in a user turn.
const groupMessages = (messages: ReadonlyArray<Prompt.Message>): ContentGroup[] => {
  const groups: ContentGroup[] = [];
  let current: ContentGroup | undefined;

  for (const message of messages) {
    switch (message.role) {
      case "system": {
        if (current?.type !== "system") {
          current = { type: "system", messages: [] };
          groups.push(current);
        }

        current.messages.push(message);
        break;
      }

      case "assistant": {
        if (current?.type !== "assistant") {
          current = { type: "assistant", messages: [] };
          groups.push(current);
        }

        current.messages.push(message);
        break;
      }

      case "tool":
      case "user": {
        if (current?.type !== "user") {
          current = { type: "user", messages: [] };
          groups.push(current);
        }

        current.messages.push(message);
        break;
      }
    }
  }

  return groups;
};

const imageMediaType = (mediaType: string): ImageMediaType | undefined => {
  if (mediaType === "image/*") {
    return "image/jpeg";
  }

  return IMAGE_MEDIA_TYPES.find((known) => known === mediaType);
};

// A data URL carries its base64 payload after the media type, which the source
// of an image block states separately.
const base64Payload = (data: string): string => data.replace(/^data:[^;]+;base64,/, "");

const imageBlock = (part: Prompt.FilePart): ContentBlock | undefined => {
  const mediaType = imageMediaType(part.mediaType);

  if (mediaType === undefined) {
    return undefined;
  }

  const data = part.data;

  if (data instanceof URL) {
    return { type: "image", source: { type: "url", url: data.toString() } };
  }

  if (Predicate.isString(data) && HTTP_URL.test(data)) {
    return { type: "image", source: { type: "url", url: data } };
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data: Predicate.isString(data) ? base64Payload(data) : Base64.encode(data),
    },
  };
};

const documentBlock = (part: Prompt.FilePart): ContentBlock | undefined => {
  if (part.mediaType !== "application/pdf" && part.mediaType !== "text/plain") {
    return undefined;
  }

  const data = part.data;
  const title = part.fileName ?? null;

  if (data instanceof URL) {
    return { type: "document", source: { type: "url", url: data.toString() }, title };
  }

  if (Predicate.isString(data) && HTTP_URL.test(data)) {
    return { type: "document", source: { type: "url", url: data }, title };
  }

  if (part.mediaType === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Predicate.isString(data) ? data : Base64.encode(data),
      },
      title,
    };
  }

  return {
    type: "document",
    source: {
      type: "text",
      media_type: "text/plain",
      data: Predicate.isString(data) ? data : new TextDecoder().decode(data),
    },
    title,
  };
};

// Anthropic carries an image or a document inline; a media type it cannot carry
// has no block. Plain text is carried by its own block, so the caller routes a
// file to the image or document block by its media type.
const fileBlock = (part: Prompt.FilePart): ContentBlock | undefined =>
  part.mediaType.startsWith("image/") ? imageBlock(part) : documentBlock(part);

const toolResultBlock = (part: Prompt.ToolResultPart): ContentBlock => ({
  type: "tool_result",
  tool_use_id: part.id,
  content: Predicate.isString(part.result) ? part.result : JSON.stringify(part.result),
  is_error: part.isFailure,
});

// Mirrors the `user` group of `prepareMessages`: a user message contributes its
// text and files, and the `tool` message that follows it contributes the tool
// results, all inside one user turn.
const userContent = (
  messages: ReadonlyArray<Prompt.UserMessage | Prompt.ToolMessage>,
): ContentBlock[] => {
  const content: ContentBlock[] = [];

  for (const message of messages) {
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type === "tool-result") {
          content.push(toolResultBlock(part));
        }
      }

      continue;
    }

    for (const part of message.content) {
      if (part.type === "text") {
        content.push({ type: "text", text: part.text });
        continue;
      }

      const block = fileBlock(part);

      if (block !== undefined) {
        content.push(block);
      }
    }
  }

  return content;
};

const toolUseBlock = (part: Prompt.ToolCallPart): ContentBlock => ({
  type: "tool_use",
  id: part.id,
  name: part.name,
  // SAFETY: a tool call's `params` is the decoded payload of the tool that was
  // called, and Anthropic takes it as the `tool_use` `input`, whose object shape
  // is the tool's own contract rather than anything this module can know.
  input: part.params as { readonly [x: string]: Schema.Json },
});

// Mirrors the `assistant` group of `prepareMessages`: text and tool calls become
// content blocks, a provider-executed tool call has no server-tool equivalent
// here and is dropped, and reasoning, files, tool results and approval requests
// have none either.
const assistantContent = (
  messages: ReadonlyArray<Prompt.AssistantMessage>,
  isLastGroup: boolean,
): ContentBlock[] => {
  const content: ContentBlock[] = [];

  for (let j = 0; j < messages.length; j++) {
    const message = messages[j];
    const isLastMessage = j === messages.length - 1;

    for (let k = 0; k < message.content.length; k++) {
      const part = message.content[k];
      const isLastPart = k === message.content.length - 1;

      switch (part.type) {
        case "text": {
          // Anthropic does not allow trailing whitespace in the final assistant
          // text block of a request.
          const text = isLastGroup && isLastMessage && isLastPart ? part.text.trim() : part.text;

          content.push({ type: "text", text });
          break;
        }

        case "tool-call": {
          if (!part.providerExecuted) {
            content.push(toolUseBlock(part));
          }

          break;
        }

        case "reasoning":
        case "file":
        case "tool-result":
        case "tool-approval-request": {
          break;
        }
      }
    }
  }

  return content;
};

/**
 * Writes a conversation in the message shape of Anthropic's Messages API.
 *
 * System messages are hoisted into the top-level `system` field and the rest are
 * grouped into alternating user and assistant turns, with tool results carried
 * in the user turn that follows their calls.
 *
 * @see The module documentation for what the conversion mirrors and drops.
 */
export const prepareMessages = (messages: ReadonlyArray<Prompt.Message>): AnthropicConversation => {
  const groups = groupMessages(messages);
  const system: SystemBlock[] = [];
  const result: AnthropicMessage[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];

    switch (group.type) {
      case "system": {
        for (const message of group.messages) {
          system.push({ type: "text", text: message.content });
        }

        break;
      }

      case "user": {
        result.push({ role: "user", content: userContent(group.messages) });
        break;
      }

      case "assistant": {
        result.push({
          role: "assistant",
          content: assistantContent(group.messages, i === groups.length - 1),
        });
        break;
      }
    }
  }

  return { system: system.length > 0 ? system : undefined, messages: result };
};

/** Converts a trajectory into the Messages API conversation of each of its sessions. */
export const makeMessages = Effect.fn("Codec.makeMessages")(function* <
  Tools extends Record<string, Tool.Any>,
  E,
  R,
>(
  trajectory: Trajectory.Trajectory<Tools, Record<string, Extension.Any>, E, R>,
): Effect.fn.Return<AnthropicSessions, E | TrajectoryError, R> {
  const sessions = yield* conversation.messagesBySession(trajectory);
  const result: AnthropicSessions = {};

  for (const [id, messages] of Object.entries(sessions)) {
    result[id] = prepareMessages(messages);
  }

  return result;
});
