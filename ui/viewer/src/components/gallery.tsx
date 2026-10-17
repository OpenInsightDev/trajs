/**
 * A gallery of the mapping: every part an `effect/ai` prompt or response can
 * carry, and the stream a response arrives in, rendered by the component each of
 * them is mapped to.
 *
 * The gallery is the mapping's own showcase rather than a viewer of produced
 * data: the parts it renders are written here with `effect/ai`'s own
 * constructors, so it needs no trajectory, no model and no network. Each section
 * names the part it shows and the component that part is mapped to, so the whole
 * mapping can be read off the page.
 */

import {
  PromptFile,
  PromptMessage,
  PromptPart,
  PromptReasoning,
  PromptText,
  PromptToolApprovalRequest,
  PromptToolApprovalResponse,
  PromptToolCall,
  PromptToolResult,
  PromptView,
  ResponseError,
  ResponseFinish,
  ResponseMetadata,
  ResponsePart,
  ResponseSource,
  ResponseStream,
  ResponseToolParams,
} from "@trajs/react";
import type { AnyResponsePart, AnyStreamPart } from "@trajs/react";
import { Button } from "@trajs/ui-component/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@trajs/ui-component/card";
import { DateTime, Schema } from "effect";
import { Prompt, Response } from "effect/ai";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/** The markdown a text part carries, written to exercise what Streamdown styles. */
const markdown = [
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

const textPart = Prompt.makePart("text", { text: markdown });

const closingTextPart = Prompt.makePart("text", {
  text: "Read one turn at a time with `View.promptTurns`, or fold a trajectory back into the prompt its model was given with `View.prompt`.",
});

const reasoningPart = Prompt.makePart("reasoning", {
  text: "The question is definitional, so a short answer that names the terms and points at the reader is enough.",
});

const filePart = Prompt.makePart("file", {
  mediaType: "image/png",
  fileName: "produced-turn.png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
});

const toolCallPart = Prompt.makePart("tool-call", {
  id: "call_8f2a",
  name: "lookup_term",
  params: { term: "trajectory", maxResults: 3 },
  providerExecuted: false,
});

const toolResultPart = Prompt.makePart("tool-result", {
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

const failedToolResultPart = Prompt.makePart("tool-result", {
  id: "call_1a4c",
  name: "read_trajectory",
  isFailure: true,
  result: { message: "ENOENT: no such file or directory, open 'run.trajs'" },
  providerExecuted: false,
});

const approvalRequestPart = Prompt.makePart("tool-approval-request", {
  approvalId: "approval_2c17",
  toolCallId: "call_44be",
});

const approvedPart = Prompt.makePart("tool-approval-response", {
  approvalId: "approval_2c17",
  approved: true,
});

const deniedPart = Prompt.makePart("tool-approval-response", {
  approvalId: "approval_2c17",
  approved: false,
  reason: "the trajectory is out of scope for this turn",
});

const systemMessage = Prompt.makeMessage("system", {
  content:
    "You answer questions about the trajs trajectory format. Be concise and point at the reader that answers the question.",
});

const userMessage = Prompt.makeMessage("user", { content: [textPart] });

const assistantMessage = Prompt.makeMessage("assistant", {
  content: [reasoningPart, textPart, toolCallPart],
});

const toolMessage = Prompt.makeMessage("tool", { content: [toolResultPart] });

const closingMessage = Prompt.makeMessage("assistant", {
  content: [closingTextPart],
});

const conversation = Prompt.fromMessages([
  systemMessage,
  userMessage,
  assistantMessage,
  toolMessage,
  closingMessage,
]);

/** The parts the dispatch section renders, as a message carries its own. */
const parts: ReadonlyArray<Prompt.Part> = [
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
const urlSourcePart = Schema.decodeSync(Response.UrlSourcePart)({
  type: "source",
  sourceType: "url",
  id: "src_04d1",
  url: "https://effect.website/docs/ai/introduction",
  title: "Effect AI — introduction",
});

const documentSourcePart = Schema.decodeSync(Response.DocumentSourcePart)({
  type: "source",
  sourceType: "document",
  id: "doc_7f30",
  mediaType: "application/pdf",
  title: "A trajectory is a stream",
  fileName: "trajectory-design.pdf",
});

const metadataPart = Response.makePart("response-metadata", {
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

const stoppedPart = Response.makePart("finish", {
  reason: "stop",
  usage: new Response.Usage({
    inputTokens: { total: 4820, cacheRead: 3392 },
    outputTokens: { total: 612 },
  }),
  response: undefined,
});

const truncatedPart = Response.makePart("finish", {
  reason: "length",
  usage: new Response.Usage({
    inputTokens: { total: 128_400 },
    outputTokens: { total: 4096 },
  }),
  response: undefined,
});

const responseTextPart = Response.makePart("text", { text: markdown });

const responseReasoningPart = Response.makePart("reasoning", {
  text: "The answer is in the response half of the turn, so the parts it carries are the ones to read.",
});

/** The response parts the dispatch section renders, in the order a turn produces them. */
const responseParts: ReadonlyArray<AnyResponsePart> = [
  responseReasoningPart,
  responseTextPart,
  urlSourcePart,
  documentSourcePart,
  metadataPart,
  stoppedPart,
];

/** The answer the stream below writes, as the markdown it ends up as. */
const streamedAnswer = [
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
const fragments = (text: string, size: number): ReadonlyArray<string> => {
  const written: Array<string> = [];

  for (let at = 0; at < text.length; at += size) written.push(text.slice(at, at + size));

  return written;
};

const parameterFragments = ['{ "term": ', '"trajectory", ', '"maxResults": 3 }'];

const responseToolCallPart = Response.makePart("tool-call", {
  id: "call_8f2a",
  name: "lookup_term",
  params: { term: "trajectory", maxResults: 3 },
  providerExecuted: false,
});

const responseErrorPart = Response.makePart("error", {
  error: { type: "overloaded_error", message: "Overloaded" },
});

const responseTextErrorPart = Response.makePart("error", {
  error: "the upstream provider timed out",
});

/**
 * One streamed turn, as the parts it arrives in: the thinking behind the answer,
 * the answer itself written a few characters at a time, the parameters of a call,
 * the call, and the end of the response.
 */
const streamParts: ReadonlyArray<AnyStreamPart> = [
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

const Section = ({
  part,
  component,
  children,
}: {
  part: string;
  component: string;
  children: ReactNode;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>{component}</CardTitle>
      <CardDescription>
        <code>{part}</code>
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">{children}</CardContent>
  </Card>
);

const Sample = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    {children}
  </div>
);

/**
 * The stream above, arriving one part at a time. A stream is read as it is
 * written, so the gallery writes this one a part at a time too: what the parts
 * received so far read as is what can be watched here, and restarting it shows
 * the answer being written from nothing again.
 */
const LiveStream = () => {
  const [written, setWritten] = useState(1);
  const [running, setRunning] = useState(true);

  const ended = written >= streamParts.length;

  useEffect(() => {
    if (!running || ended) return;

    const timer = setTimeout(() => setWritten((parts) => parts + 1), 70);

    return () => clearTimeout(timer);
  }, [running, ended, written]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setWritten(1);
            setRunning(true);
          }}
        >
          Restart
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={ended}
          onClick={() => setRunning((streaming) => !streaming)}
        >
          {running && !ended ? "Pause" : "Play"}
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {`${written} of ${streamParts.length} parts`}
        </span>
      </div>
      <ResponseStream parts={streamParts.slice(0, written)} />
    </div>
  );
};

/**
 * The gallery: one section per part type, then the roles of a message, a whole
 * prompt, the parts only a response carries, and the stream a response arrives
 * in.
 */
export const Gallery = () => (
  <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
    <header className="flex flex-col gap-1">
      <a className="text-sm text-muted-foreground underline underline-offset-4" href="#/">
        ← Back to the viewer
      </a>
      <h1 className="text-2xl font-semibold tracking-tight">Prompt and response components</h1>
      <p className="text-sm text-muted-foreground">
        Every part of an <code>effect/ai</code> prompt or response — and the stream a response
        arrives in — rendered by the shadcn/ui chat component that part is mapped to. The parts
        below are written in the gallery itself, so nothing here is produced or requested from a
        model.
      </p>
    </header>

    <Section part="Prompt.TextPart" component="PromptText">
      <Sample label="a user's text">
        <PromptText text={markdown} variant="secondary" />
      </Sample>
      <Sample label="an assistant's text">
        <PromptText text={markdown} variant="ghost" />
      </Sample>
    </Section>

    <Section part="Prompt.ReasoningPart" component="PromptReasoning">
      <PromptReasoning part={reasoningPart} />
    </Section>

    <Section part="Prompt.FilePart" component="PromptFile">
      <PromptFile part={filePart} />
    </Section>

    <Section part="Prompt.ToolCallPart" component="PromptToolCall">
      <PromptToolCall part={toolCallPart} />
    </Section>

    <Section part="Prompt.ToolResultPart" component="PromptToolResult">
      <Sample label="a tool that answered">
        <PromptToolResult part={toolResultPart} />
      </Sample>
      <Sample label="a tool that failed">
        <PromptToolResult part={failedToolResultPart} />
      </Sample>
    </Section>

    <Section part="Prompt.ToolApprovalRequestPart" component="PromptToolApprovalRequest">
      <PromptToolApprovalRequest part={approvalRequestPart} />
    </Section>

    <Section part="Prompt.ToolApprovalResponsePart" component="PromptToolApprovalResponse">
      <Sample label="approved">
        <PromptToolApprovalResponse part={approvedPart} />
      </Sample>
      <Sample label="denied">
        <PromptToolApprovalResponse part={deniedPart} />
      </Sample>
    </Section>

    <Section part="Prompt.Message" component="PromptMessage">
      <PromptMessage message={systemMessage} />
      <PromptMessage message={userMessage} />
      <PromptMessage message={assistantMessage} />
      <PromptMessage message={toolMessage} />
    </Section>

    <Section part="Prompt.Part" component="PromptPart">
      <div className="flex flex-col gap-4">
        {parts.map((part, index) => (
          <PromptPart key={index} part={part} textVariant="ghost" />
        ))}
      </div>
    </Section>

    <Section part="Prompt.Prompt" component="PromptView">
      <PromptView prompt={conversation} />
    </Section>

    <h2 className="mt-4 text-xl font-semibold tracking-tight">Response components</h2>
    <p className="text-sm text-muted-foreground">
      The parts only a response carries. The shapes a response shares with a prompt — its text, its
      reasoning, its files and its tool calls — are rendered by the components above.
    </p>

    <Section part="Response.UrlSourcePart | Response.DocumentSourcePart" component="ResponseSource">
      <Sample label="a URL the answer was given from">
        <ResponseSource part={urlSourcePart} />
      </Sample>
      <Sample label="a document the answer was given from">
        <ResponseSource part={documentSourcePart} />
      </Sample>
    </Section>

    <Section part="Response.ResponseMetadataPart" component="ResponseMetadata">
      <ResponseMetadata part={metadataPart} />
    </Section>

    <Section part="Response.FinishPart" component="ResponseFinish">
      <Sample label="a response that reached its own end">
        <ResponseFinish part={stoppedPart} />
      </Sample>
      <Sample label="a response cut short by its length">
        <ResponseFinish part={truncatedPart} />
      </Sample>
    </Section>

    <Section part="Response.Part" component="ResponsePart">
      <div className="flex flex-col gap-4">
        {responseParts.map((part, index) => (
          <ResponsePart key={index} part={part} />
        ))}
      </div>
    </Section>

    <h2 className="mt-4 text-xl font-semibold tracking-tight">Streaming</h2>
    <p className="text-sm text-muted-foreground">
      A response that is still arriving: the parts it is written in, read as the answer they have
      written so far. What the stream has not closed reads in the streaming state of the component
      its part maps to, which is what tells a reader that the answer is not finished.
    </p>

    <Section part="Response.StreamPart" component="ResponseStream">
      <Sample label="the stream, arriving a part at a time">
        <LiveStream />
      </Sample>
      <Sample label="the same parts, once the stream has ended">
        <ResponseStream parts={streamParts} />
      </Sample>
    </Section>

    <Section
      part="Response.ToolParamsStartPart | Response.ToolParamsDeltaPart | Response.ToolParamsEndPart"
      component="ResponseToolParams"
    >
      <Sample label="parameters still being written">
        <ResponseToolParams
          streaming
          part={{
            id: "call_8f2a",
            name: "lookup_term",
            providerExecuted: false,
            parameters: '{ "term": "traj',
          }}
        />
      </Sample>
      <Sample label="parameters written, before the call is produced">
        <ResponseToolParams
          part={{
            id: "call_8f2a",
            name: "lookup_term",
            providerExecuted: false,
            parameters: parameterFragments.join(""),
          }}
        />
      </Sample>
    </Section>

    <Section part="Response.ErrorPart" component="ResponseError">
      <Sample label="an error a provider produced as a value">
        <ResponseError part={responseErrorPart} />
      </Sample>
      <Sample label="an error a provider produced as plain text">
        <ResponseError part={responseTextErrorPart} />
      </Sample>
    </Section>
  </main>
);
