/**
 * The samples the mapping's pages are read against: the parts, messages, prompt
 * and streams the pages render. They are written with `effect/ai`'s own
 * constructors, so a page shows the mapping against the model it maps rather than
 * against a trajectory — reading one needs no trajectory, no model and no
 * network.
 *
 * A sample is written once here rather than restated on the page that renders it,
 * because a part is what several pages show: the same text is a prompt's text and
 * a response's, and the same call is read by the component that shows it and by
 * the stream that writes it.
 */

import type { AnyResponsePart, AnyStreamPart } from "@trajs/ui-component";
import { DateTime, Schema } from "effect";
import { Prompt, Response } from "effect/ai";

/** The markdown a text part carries, written to exercise what Streamdown styles. */
export const markdown = [
  "A trajectory is a **stream of parts** in one total order: the messages a model was given, the parts it returned, session declarations and extension data.",
  "",
  "A prompt part opens a turn, and every response part that follows it is part of that turn:",
  "",
  "- the increments of a streamed response are folded into the part they complete",
  "- a response part that no prompt precedes belongs to no turn",
  "",
  "```ts",
  "const steps = await Effect.runPromise(Stream.runCollect(Step.steps(trajectory)))",
  "```",
].join("\n");

/** The answer the stream below writes, as the markdown it ends up as. */
export const streamedAnswer = [
  "A trajectory is a **stream of parts** in one total order, so the exchange it produces is read by grouping the parts that follow one another:",
  "",
  "- the increments of a streamed response are folded into the part they complete",
  "- a response part that no prompt precedes belongs to no turn",
  "",
  "```ts",
  "const turns = await Effect.runPromise(Stream.runCollect(View.promptTurns(trajectory)))",
  "```",
].join("\n");

/**
 * The text above in the fragments a stream writes it in: a model writes a few
 * characters at a time, so the markdown is cut where the writing had reached
 * rather than where a block of it ends.
 */
export const fragments = (text: string, size: number): ReadonlyArray<string> => {
  const written: Array<string> = [];

  for (let at = 0; at < text.length; at += size) written.push(text.slice(at, at + size));

  return written;
};

export const textPart = Prompt.makePart("text", { text: markdown });

export const closingTextPart = Prompt.makePart("text", {
  text: "Read one turn at a time with `View.promptTurns`, or fold a trajectory back into the prompt its model was given with `View.prompt`.",
});

export const reasoningPart = Prompt.makePart("reasoning", {
  text: "The question is definitional, so a short answer that names the terms and points at the reader is enough.",
});

export const filePart = Prompt.makePart("file", {
  mediaType: "image/png",
  fileName: "produced-turn.png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
});

export const toolCallPart = Prompt.makePart("tool-call", {
  id: "call_8f2a",
  name: "lookup_term",
  params: { term: "trajectory", maxResults: 3 },
  providerExecuted: false,
});

export const toolResultPart = Prompt.makePart("tool-result", {
  id: "call_8f2a",
  name: "lookup_term",
  isFailure: false,
  result: {
    term: "trajectory",
    summary: "A trajectory of what a program did with a model.",
    readWith: ["View.promptTurns", "Step.steps"],
  },
  providerExecuted: false,
});

export const failedToolResultPart = Prompt.makePart("tool-result", {
  id: "call_1a4c",
  name: "read_trajectory",
  isFailure: true,
  result: { message: "ENOENT: no such file or directory, open 'run.trajs'" },
  providerExecuted: false,
});

export const approvalRequestPart = Prompt.makePart("tool-approval-request", {
  approvalId: "approval_2c17",
  toolCallId: "call_44be",
});

export const approvedPart = Prompt.makePart("tool-approval-response", {
  approvalId: "approval_2c17",
  approved: true,
});

export const deniedPart = Prompt.makePart("tool-approval-response", {
  approvalId: "approval_2c17",
  approved: false,
  reason: "the trajectory is out of scope for this turn",
});

export const systemMessage = Prompt.makeMessage("system", {
  content:
    "You answer questions about the trajs trajectory format. Be concise and point at the reader that answers the question.",
});

export const userMessage = Prompt.makeMessage("user", { content: [textPart] });

export const assistantMessage = Prompt.makeMessage("assistant", {
  content: [reasoningPart, textPart, toolCallPart],
});

export const toolMessage = Prompt.makeMessage("tool", { content: [toolResultPart] });

export const closingMessage = Prompt.makeMessage("assistant", {
  content: [closingTextPart],
});

export const conversation = Prompt.fromMessages([
  systemMessage,
  userMessage,
  assistantMessage,
  toolMessage,
  closingMessage,
]);

/** The parts the dispatch component reads, as a message carries its own. */
export const parts: ReadonlyArray<Prompt.Part> = [
  textPart,
  reasoningPart,
  filePart,
  toolCallPart,
  toolResultPart,
  approvalRequestPart,
  deniedPart,
];

/**
 * A source part is written as its schema decodes it rather than with
 * `Response.makePart`: the two kinds of source share one `type` and are told
 * apart by `sourceType`, which the parameters `makePart` accepts flatten away.
 */
export const urlSourcePart = Schema.decodeSync(Response.UrlSourcePart)({
  type: "source",
  sourceType: "url",
  id: "src_04d1",
  url: "https://effect.website/docs/ai/introduction",
  title: "Effect AI — introduction",
});

export const documentSourcePart = Schema.decodeSync(Response.DocumentSourcePart)({
  type: "source",
  sourceType: "document",
  id: "doc_7f30",
  mediaType: "application/pdf",
  title: "A trajectory is a stream",
  fileName: "trajectory-design.pdf",
});

export const metadataPart = Response.makePart("response-metadata", {
  id: "resp_2f81",
  modelId: "claude-sonnet-4-6",
  timestamp: DateTime.makeUnsafe("2025-05-04T09:12:07Z"),
  request: {
    method: "POST",
    url: "https://api.anthropic.com/v1/messages",
    urlParams: [],
    headers: {},
  },
});

export const stoppedPart = Response.makePart("finish", {
  reason: "stop",
  usage: new Response.Usage({
    inputTokens: { total: 4820, cacheRead: 3392 },
    outputTokens: { total: 612 },
  }),
  response: undefined,
});

export const truncatedPart = Response.makePart("finish", {
  reason: "length",
  usage: new Response.Usage({
    inputTokens: { total: 128_400 },
    outputTokens: { total: 4096 },
  }),
  response: undefined,
});

export const responseTextPart = Response.makePart("text", { text: markdown });

export const responseReasoningPart = Response.makePart("reasoning", {
  text: "The answer is in the response half of the turn, so the parts it carries are the ones to read.",
});

/** The response parts the dispatch component reads, in the order a turn produces them. */
export const responseParts: ReadonlyArray<AnyResponsePart> = [
  responseReasoningPart,
  responseTextPart,
  urlSourcePart,
  documentSourcePart,
  metadataPart,
  stoppedPart,
];

export const parameterFragments = ['{ "term": ', '"trajectory", ', '"maxResults": 3 }'];

export const responseToolCallPart = Response.makePart("tool-call", {
  id: "call_8f2a",
  name: "lookup_term",
  params: { term: "trajectory", maxResults: 3 },
  providerExecuted: false,
});

export const responseErrorPart = Response.makePart("error", {
  error: { type: "overloaded_error", message: "Overloaded" },
});

export const responseTextErrorPart = Response.makePart("error", {
  error: "the upstream provider timed out",
});

/**
 * One streamed turn, as the parts it arrives in: the thinking behind the answer,
 * the answer itself written a few characters at a time, the parameters of a call,
 * the call, and the end of the response.
 */
export const streamParts: ReadonlyArray<AnyStreamPart> = [
  Response.makePart("reasoning-start", { id: "reasoning_5d0c" }),
  Response.makePart("reasoning-delta", {
    id: "reasoning_5d0c",
    delta:
      "The question is about how a trajectory is read, so the answer is the reader that reads it ",
  }),
  Response.makePart("reasoning-delta", {
    id: "reasoning_5d0c",
    delta: "one turn at a time, and the folding it does on the way.",
  }),
  Response.makePart("reasoning-end", { id: "reasoning_5d0c" }),
  Response.makePart("text-start", { id: "text_8a41" }),
  ...fragments(streamedAnswer, 8).map((delta) =>
    Response.makePart("text-delta", { id: "text_8a41", delta }),
  ),
  Response.makePart("text-end", { id: "text_8a41" }),
  Response.makePart("tool-params-start", {
    id: "call_8f2a",
    name: "lookup_term",
    providerExecuted: false,
  }),
  ...parameterFragments.map((delta) =>
    Response.makePart("tool-params-delta", { id: "call_8f2a", delta }),
  ),
  Response.makePart("tool-params-end", { id: "call_8f2a" }),
  responseToolCallPart,
  stoppedPart,
];
