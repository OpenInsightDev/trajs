/**
 * Converts a trajectory into the messages of a model request.
 *
 * A request is one list of messages, while a trajectory is a stream of parts
 * that may interleave several sessions. This module reads a recording and writes
 * each of its sessions in the request shape of a provider, so a recording can be
 * replayed or evaluated with that provider's model: {@link makeChatCompletion}
 * writes the chat completion messages of `@effect/ai-openai-compat` and
 * {@link makeMessages} writes the Messages API conversation of
 * `@effect/ai-anthropic`.
 */

import type { Generated } from "@effect/ai-anthropic";
import type { OpenAiClient } from "@effect/ai-openai-compat";
import type { Effect } from "effect";
import type { Tool } from "effect/ai";
import * as anthropic from "#/internal/anthropic.ts";
import * as openaiCompat from "#/internal/openai-compat.ts";
import type * as Extension from "#/Extension.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A message accepted by a chat completions endpoint.
 *
 * **When to use**
 *
 * Use when a recorded conversation is replayed against, or exported to, an
 * OpenAI-compatible model.
 *
 * @see {@link makeChatCompletion} for the conversion that produces them.
 * @category models
 */
export type ChatCompletionMessage = OpenAiClient.ChatCompletionRequestMessage;

/**
 * The chat completion messages of a trajectory, keyed by session.
 *
 * **When to use**
 *
 * Use to read each session of a recording as the conversation a model ran on.
 *
 * **Details**
 *
 * Each key is a `session` recorded on the parts of the trajectory, and its value
 * is that session's messages in the order they were recorded. Parts that carry
 * no `session` are grouped under the empty string, so a recording with a single
 * undeclared conversation still yields one array.
 *
 * @category models
 */
export type ChatCompletionSessions = Record<string, ChatCompletionMessage[]>;

/**
 * Converts a trajectory into the chat completion messages of each of its
 * sessions.
 *
 * **When to use**
 *
 * Use to replay a recorded conversation against an OpenAI-compatible model, or
 * to export it to a tool that speaks the chat completions format.
 *
 * **Details**
 *
 * The parts are grouped by the `session` they carry, and each group is folded
 * with {@link View.prompt}, so a prompt part contributes the messages the
 * model was given and the response parts that follow it contribute the messages
 * it returned. Parts that carry no `session` are grouped under the empty string.
 * Session parts carry no messages and are skipped.
 *
 * The conversion is lossy where chat completions has no equivalent: reasoning,
 * non-image file and tool approval parts are dropped, and a file that is not an
 * image cannot be sent inline. A provider-executed tool result, which a
 * trajectory records on the assistant message, is written as its own `tool`
 * message.
 *
 * **Example** (Exporting a recording as chat completion messages)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Codec, Trajectory } from "@trajs/core"
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(Trajectory.promptPart(Prompt.make("Hello")))
 * )
 *
 * const sessions = await Effect.runPromise(Codec.makeChatCompletion(trajectory))
 * sessions[""] // => [{ role: "user", content: "Hello" }]
 * ```
 *
 * @see {@link ChatCompletionMessage} for the message shape produced.
 * @see {@link ChatCompletionSessions} for the result keyed by session.
 * @see {@link makeMessages} for the Messages API conversion.
 * @category encoding
 */
export const makeChatCompletion = <Tools extends Record<string, Tool.Any>, E, R>(
  trajectory: Trajectory.Trajectory<Tools, Record<string, Extension.Any>, E, R>,
): Effect.Effect<ChatCompletionSessions, E | TrajectoryError, R> =>
  openaiCompat.makeChatCompletion(trajectory);

/**
 * A message accepted by Anthropic's Messages API.
 *
 * **When to use**
 *
 * Use when a recorded conversation is replayed against, or exported to, an
 * Anthropic model.
 *
 * @see {@link AnthropicConversation} for the conversation a session is written
 * as.
 * @see {@link makeMessages} for the conversion that produces them.
 * @category models
 */
export type AnthropicMessage = Generated.BetaInputMessage;

/**
 * The conversation of one session, as Anthropic's Messages API reads it.
 *
 * **When to use**
 *
 * Use to read a session of a recording as the request an Anthropic model would
 * be given, apart from the fields the recording does not carry.
 *
 * **Details**
 *
 * Anthropic has no `system` message role: the system instructions of a session
 * are hoisted into `system`, which the Messages API takes as a top-level field
 * rather than as a message. `messages` then alternates between the `user` and
 * `assistant` turns of the session, with a tool result carried in the `user`
 * turn that follows the tool call it answers. `model`, `max_tokens` and the
 * tools themselves are not part of the conversation and are left to the caller.
 *
 * @see {@link AnthropicMessage} for the messages it holds.
 * @see {@link AnthropicSessions} for the result keyed by session.
 * @category models
 */
export type AnthropicConversation = {
  /**
   * The system instructions of the session, hoisted out of the message list.
   */
  readonly system?: string | ReadonlyArray<Generated.BetaRequestTextBlock>;
  /**
   * The user and assistant turns of the session.
   */
  readonly messages: ReadonlyArray<AnthropicMessage>;
};

/**
 * The Messages API conversations of a trajectory, keyed by session.
 *
 * **When to use**
 *
 * Use to read each session of a recording as the conversation an Anthropic model
 * ran on.
 *
 * **Details**
 *
 * Each key is a `session` recorded on the parts of the trajectory, and its value
 * is that session's conversation in the order it was recorded. Parts that carry
 * no `session` are grouped under the empty string, so a recording with a single
 * undeclared conversation still yields one conversation.
 *
 * @see {@link AnthropicConversation} for the conversation of one session.
 * @category models
 */
export type AnthropicSessions = Record<string, AnthropicConversation>;

/**
 * Converts a trajectory into the Messages API conversation of each of its
 * sessions.
 *
 * **When to use**
 *
 * Use to replay a recorded conversation against an Anthropic model, or to export
 * it to a tool that speaks Anthropic's Messages API.
 *
 * **Details**
 *
 * Each session is grouped and folded exactly as {@link makeChatCompletion} does,
 * and its messages are then written in the shape of `@effect/ai-anthropic`: the
 * system messages are hoisted into the top-level `system` field, consecutive
 * turns of a role are merged, and a tool result is carried in the user turn that
 * follows its tool call.
 *
 * The conversion is lossy where the Messages API has no equivalent: reasoning, a
 * provider-executed tool call or result, a tool approval part, and a file that
 * is neither an image nor a PDF or plain text are dropped. This mirrors the
 * Anthropic language model of the Effect AI SDK, whose request building this
 * conversion follows.
 *
 * **Example** (Exporting a recording as Messages API messages)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Codec, Trajectory } from "@trajs/core"
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(Trajectory.promptPart(Prompt.make("Hello")))
 * )
 *
 * const sessions = await Effect.runPromise(Codec.makeMessages(trajectory))
 * sessions[""].system // => undefined
 * sessions[""].messages // => [{ role: "user", content: [{ type: "text", text: "Hello" }] }]
 * ```
 *
 * @see {@link AnthropicMessage} for the message shape produced.
 * @see {@link AnthropicConversation} for the conversation of one session.
 * @see {@link AnthropicSessions} for the result keyed by session.
 * @see {@link makeChatCompletion} for the chat completions conversion.
 * @category encoding
 */
export const makeMessages = <Tools extends Record<string, Tool.Any>, E, R>(
  trajectory: Trajectory.Trajectory<Tools, Record<string, Extension.Any>, E, R>,
): Effect.Effect<AnthropicSessions, E | TrajectoryError, R> => anthropic.makeMessages(trajectory);
