"use client";

/**
 * One demo per component in the mapping, each rendering the real component
 * against the samples in `samples.ts`. A page shows a demo rather than writing
 * the component out itself, so what the page reads is the same part the pages
 * beside it read, and a sample that changes changes everywhere it is shown.
 *
 * The demos are client components because the components they render are: a
 * reasoning part folds open, a stream writes itself a part at a time. Fumapress
 * renders a client component on the server as well, so a demo is still in the
 * page's HTML, in its search index and in the Markdown an agent is served.
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
  ToolPayload,
} from "@trajs/ui-component";
import { Button } from "@trajs/ui-shadcn/button";
import { useEffect, useState } from "react";

import { Sample } from "../sample";
import {
  approvalRequestPart,
  approvedPart,
  assistantMessage,
  conversation,
  deniedPart,
  documentSourcePart,
  failedToolResultPart,
  filePart,
  markdown,
  metadataPart,
  parameterFragments,
  parts,
  reasoningPart,
  responseErrorPart,
  responseParts,
  responseTextErrorPart,
  stoppedPart,
  streamParts,
  systemMessage,
  toolCallPart,
  toolMessage,
  toolResultPart,
  truncatedPart,
  urlSourcePart,
  userMessage,
} from "./samples";

export const PromptTextDemo = () => (
  <div className="flex flex-col gap-4">
    <Sample label="a user's text">
      <PromptText text={markdown} variant="secondary" />
    </Sample>
    <Sample label="an assistant's text">
      <PromptText text={markdown} variant="ghost" />
    </Sample>
  </div>
);

export const PromptReasoningDemo = () => <PromptReasoning part={reasoningPart} />;

export const PromptFileDemo = () => <PromptFile part={filePart} />;

export const PromptToolCallDemo = () => <PromptToolCall part={toolCallPart} />;

export const PromptToolResultDemo = () => (
  <div className="flex flex-col gap-4">
    <Sample label="a tool that answered">
      <PromptToolResult part={toolResultPart} />
    </Sample>
    <Sample label="a tool that failed">
      <PromptToolResult part={failedToolResultPart} />
    </Sample>
  </div>
);

export const PromptToolApprovalRequestDemo = () => (
  <PromptToolApprovalRequest part={approvalRequestPart} />
);

export const PromptToolApprovalResponseDemo = () => (
  <div className="flex flex-col gap-4">
    <Sample label="approved">
      <PromptToolApprovalResponse part={approvedPart} />
    </Sample>
    <Sample label="denied">
      <PromptToolApprovalResponse part={deniedPart} />
    </Sample>
  </div>
);

export const PromptMessageDemo = () => (
  <div className="flex flex-col gap-4">
    <PromptMessage message={systemMessage} />
    <PromptMessage message={userMessage} />
    <PromptMessage message={assistantMessage} />
    <PromptMessage message={toolMessage} />
  </div>
);

export const PromptPartDemo = () => (
  <div className="flex flex-col gap-4">
    {parts.map((part, index) => (
      <PromptPart key={index} part={part} textVariant="ghost" />
    ))}
  </div>
);

export const PromptViewDemo = () => <PromptView prompt={conversation} />;

export const ToolPayloadDemo = () => <ToolPayload payload={toolResultPart.result} />;

export const ResponseSourceDemo = () => (
  <div className="flex flex-col gap-4">
    <Sample label="a URL the answer was given from">
      <ResponseSource part={urlSourcePart} />
    </Sample>
    <Sample label="a document the answer was given from">
      <ResponseSource part={documentSourcePart} />
    </Sample>
  </div>
);

export const ResponseMetadataDemo = () => <ResponseMetadata part={metadataPart} />;

export const ResponseFinishDemo = () => (
  <div className="flex flex-col gap-4">
    <Sample label="a response that reached its own end">
      <ResponseFinish part={stoppedPart} />
    </Sample>
    <Sample label="a response cut short by its length">
      <ResponseFinish part={truncatedPart} />
    </Sample>
  </div>
);

export const ResponsePartDemo = () => (
  <div className="flex flex-col gap-4">
    {responseParts.map((part, index) => (
      <ResponsePart key={index} part={part} />
    ))}
  </div>
);

/**
 * The stream in `samples.ts`, arriving one part at a time. A stream is read as
 * it is written, so the demo writes this one a part at a time too: what the
 * parts received so far read as is what can be watched here, and restarting it
 * shows the answer being written from nothing again.
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

export const ResponseStreamDemo = () => (
  <div className="flex flex-col gap-4">
    <Sample label="the stream, arriving a part at a time">
      <LiveStream />
    </Sample>
    <Sample label="the same parts, once the stream has ended">
      <ResponseStream parts={streamParts} />
    </Sample>
  </div>
);

export const ResponseToolParamsDemo = () => (
  <div className="flex flex-col gap-4">
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
  </div>
);

export const ResponseErrorDemo = () => (
  <div className="flex flex-col gap-4">
    <Sample label="an error a provider produced as a value">
      <ResponseError part={responseErrorPart} />
    </Sample>
    <Sample label="an error a provider produced as plain text">
      <ResponseError part={responseTextErrorPart} />
    </Sample>
  </div>
);
