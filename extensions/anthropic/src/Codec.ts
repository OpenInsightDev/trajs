/**
 * Reading a trajectory as the conversations the Anthropic Messages API takes.
 *
 * A trajectory holds every session that ran, in one stream of parts — see
 * `Trajectory` of `@trajs/core` — and what the API is handed is not that stream: it
 * is one conversation per session, holding the messages the session's model was given
 * and answered in the order they were produced, and what the session inherited from
 * the one it continues from. {@link makeAnthropic} reads the sessions of a trajectory
 * as those conversations; a trajectory read as the messages a chat completions API of
 * an OpenAI-compatible client takes is `@trajs/extension-openai-compat`.
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
 * - A model's reasoning, since the API takes a thinking block back only with the
 *   signature it was returned with.
 * - A tool a provider executed itself, and the result it answered with, since those
 *   are the provider's own record of a call it made — see `providerExecuted`.
 * - A file part that is not an image, and an image the API does not read — a
 *   document, a media type of the caller's own — which the API refers to in ways of
 *   its own rather than by the bytes a trajectory holds.
 * - The approval of a tool call, which is part of a handshake with the program that
 *   ran the tools rather than of the conversation the API was given.
 */

import type { Generated } from "@effect/ai-anthropic";
import { View } from "@trajs/core";
import * as Config from "@trajs/core/Config";
import type * as Session from "@trajs/core/Session";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect, Predicate } from "effect";
import type { Prompt } from "effect/ai";
import * as Base64 from "effect/encoding/Base64";

/**
 * A message of the Anthropic Messages API.
 *
 * @see {@link makeAnthropic} for the operation that reads a trajectory as them.
 * @category models
 */
export type AnthropicMessage = Generated.BetaInputMessage;

/**
 * One conversation of a trajectory as the Anthropic Messages API takes it: the
 * instructions the model was given, and the messages it was given and answered.
 *
 * **Details**
 *
 * `system` is every system message of the conversation, read as the text blocks
 * the API states instructions in, and is left out where the conversation was given
 * none: the API takes the instructions of a call apart from the messages of the
 * conversation, so a system message produced among them is read here rather than
 * where it was produced.
 *
 * @see {@link makeAnthropic} for the operation that reads a trajectory as them.
 * @category models
 */
export type AnthropicConversation = Readonly<{
  system?: string | ReadonlyArray<Generated.BetaRequestTextBlock>;
  messages: ReadonlyArray<AnthropicMessage>;
}>;

/**
 * The conversations of every session of a trajectory, keyed by the id of the
 * session.
 *
 * @see {@link makeAnthropic} for the operation that reads a trajectory as them.
 * @category models
 */
export type AnthropicSessions = Record<string, AnthropicConversation>;

/**
 * Reads the sessions of a trajectory as the conversations the Anthropic Messages API takes,
 * one conversation per session.
 *
 * **When to use**
 *
 * Use when a conversation read from a trajectory is handed back to Claude — to continue it, or
 * to run it against another model — rather than read in `@trajs/core`'s own terms.
 *
 * **Details**
 *
 * - What it is given is what `Session.toSessions` read of a trajectory, so a trajectory is
 *   read as its sessions before it is read as conversations: one reading of it serves every
 *   session it holds ({@link Session.Sessions}).
 * - The conversation of a session holds the messages the session produced and the
 *   messages it inherited: what the sessions it continues from produced up to the
 *   part it continues from, from the root of the fork down.
 * - Every system message of a conversation is read as its `system`, since the API
 *   states the instructions of a call apart from the messages of the conversation
 *   ({@link AnthropicConversation}).
 * - A tool result is read on the user's side of the conversation, which is where
 *   the API states one, whether the trajectory holds it as a tool message of a
 *   prompt or as part of a response; a user message and the tool results following
 *   it are read as one message, since the API states the roles of a conversation
 *   alternating.
 *
 * The effect fails with what reading the parts of a session fails with — the
 * {@link TrajectoryError} a trajectory whose parts cannot be read fails with, on top of what
 * the store they are kept in fails with — and requires the services `R` names.
 *
 * **Example** (Reading a trajectory as the messages of a call and its answer)
 *
 * ```ts import.meta.vitest
 * import { Codec } from "@trajs/extension-anthropic"
 * import { EventKit, ExtraKit, MetricKit, Prompt, Response, Toolkit, Trajectory } from "@trajs/core"
 * import { Effect, Stream } from "effect"
 *
 * // The main session, which the parts below belong to.
 * const sessionId = Trajectory.mainSessionId
 * const config = Config.config({
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
 *     Prompt.fromMessages([
 *       Prompt.makeMessage("system", { content: "Answer in one sentence." }),
 *       Prompt.makeMessage("user", {
 *         content: [Prompt.makePart("text", { text: "What is the weather in Paris?" })]
 *       })
 *     ]),
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
 * const conversations = await Effect.runPromise(Codec.makeAnthropic(sessions))
 * const conversation = conversations[sessionId]
 *
 * conversation?.messages.map((message) => message.role) // => ["user", "assistant", "user", "assistant"]
 * Array.isArray(conversation?.system) ? conversation.system.length : 0 // => 1
 * ```
 *
 * @see {@link AnthropicSessions} for the conversations it reads to.
 * @see {@link View.conversations} for the conversations it writes out.
 * @see {@link Session.toSessions} for the sessions it is given.
 * @category constructors
 */
export const makeAnthropic = <Config extends Config.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): Effect.Effect<AnthropicSessions, E | TrajectoryError, R> =>
  View.conversations(sessions).pipe(
    Effect.map((sessions) => {
      const encoded: AnthropicSessions = {};

      for (const [id, messages] of Object.entries(sessions)) {
        encoded[id] = anthropicConversation(messages);
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

/** A location an image part names, as opposed to the bytes it holds, which the API reads as an image's URL. */
const located = /^https?:\/\//i;

const anthropicConversation = (messages: View.Conversation): AnthropicConversation => {
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
