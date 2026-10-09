/**
 * Converts a trajectory into the chat completion messages of its sessions.
 *
 * A chat completion request is one flat list of messages, while a trajectory is
 * a stream of parts that may interleave several sessions. This module reads a
 * recording and writes each of its sessions as the messages a chat completions
 * endpoint accepts, using the request shapes of `@effect/ai-openai-compat`, so a
 * recording can be replayed or evaluated with any OpenAI-compatible model.
 */

import type { OpenAiClient } from "@effect/ai-openai-compat";
import type { Effect } from "effect";
import type { Tool } from "effect/ai";
import * as codec from "#/internal/codec.ts";
import type * as Extensionkit from "#/Extensionkit.ts";
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
 * with {@link Trajectory.prompt}, so a prompt part contributes the messages the
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
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Codec, Trajectory } from "@trajs/core"
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(Trajectory.promptPart(Prompt.make("Hello"))),
 *   Toolkit.empty
 * )
 *
 * const sessions = await Effect.runPromise(Codec.makeChatCompletion(trajectory))
 * sessions[""] // => [{ role: "user", content: "Hello" }]
 * ```
 *
 * @see {@link ChatCompletionMessage} for the message shape produced.
 * @see {@link ChatCompletionSessions} for the result keyed by session.
 * @category encoding
 */
export const makeChatCompletion = <Tools extends Record<string, Tool.Any>, E, R>(
  trajectory: Trajectory.Trajectory<Tools, Extensionkit.Any, E, R>,
): Effect.Effect<ChatCompletionSessions, E | TrajectoryError, R> =>
  codec.makeChatCompletion(trajectory);
