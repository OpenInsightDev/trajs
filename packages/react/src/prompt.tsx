/**
 * The mapping from `effect/ai`'s prompt model to shadcn/ui's chat components:
 * one component per part — {@link PromptText}, {@link PromptReasoning},
 * {@link PromptFile}, {@link PromptToolCall}, {@link PromptToolResult},
 * {@link PromptToolApprovalRequest} and {@link PromptToolApprovalResponse} —
 * with {@link PromptPart} dispatching on a part's `type`, and
 * {@link PromptMessage} / {@link PromptView} laying a message or a whole prompt
 * out as the conversation it is. The shapes a response shares with a prompt are
 * rendered by these same components, as is the streaming state a response writes
 * them in; `response.tsx` is what dispatches over the response union, and
 * `stream.tsx` is what reads a stream of response parts as the answer it is
 * writing.
 */

import { code } from "@streamdown/code";
import { Alert, AlertDescription, AlertTitle } from "@trajs/ui/components/alert";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@trajs/ui/components/attachment";
import { Avatar, AvatarFallback } from "@trajs/ui/components/avatar";
import { Badge } from "@trajs/ui/components/badge";
import { Bubble, BubbleContent } from "@trajs/ui/components/bubble";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@trajs/ui/components/collapsible";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@trajs/ui/components/item";
import { Marker, MarkerContent, MarkerIcon } from "@trajs/ui/components/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@trajs/ui/components/message";
import { Spinner } from "@trajs/ui/components/spinner";
import { cn } from "cn";
import type { Prompt } from "effect/ai";
import {
  Check,
  ChevronDown,
  File as FileIcon,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Streamdown } from "streamdown";

import { ToolPayload } from "./tool-payload.tsx";

/**
 * A component reads the fields of a part rather than the part as `effect/ai`
 * types it: a response part records the same things a prompt part does, and the
 * two unions differ in the type id they carry, not in what they say. Each
 * component is therefore typed by the fields it reads, which both unions
 * satisfy — a response's file part carries bytes and no file name, which the
 * prompt's optional name already allows for.
 */
type ReasoningPart = Pick<Prompt.ReasoningPart, "text">;

type FilePart = Pick<Prompt.FilePart, "data" | "fileName" | "mediaType">;

type ToolCallPart = Pick<Prompt.ToolCallPart, "id" | "name" | "params" | "providerExecuted">;

type ToolResultPart = Pick<Prompt.ToolResultPart, "id" | "isFailure" | "name" | "result">;

type ToolApprovalRequestPart = Pick<Prompt.ToolApprovalRequestPart, "approvalId" | "toolCallId">;

/**
 * The bubble a message's text is surfaced in.
 *
 * **When to use**
 *
 * Use to say how the text of a message should read — a user's text is a filled
 * bubble, an assistant's a ghost one — rather than to style a part's content.
 *
 * @see {@link PromptText} for the component it styles.
 * @category models
 */
export type PromptTextVariant = NonNullable<ComponentProps<typeof Bubble>["variant"]>;

/**
 * A recorded file payload is a URL, raw bytes or the text of the file; nothing
 * decodes it, so its size is shown beside the media type instead.
 */
const fileDataOf = (data: Prompt.FilePart["data"]): string => {
  if (data instanceof URL) return data.toString();

  if (data instanceof Uint8Array) return `${data.byteLength} bytes`;

  return `${data.length} characters`;
};

/**
 * Held once rather than built per render, so that a re-render does not hand
 * Streamdown a new set of plugins to highlight with.
 */
const plugins = { code };

/**
 * Markdown is rendered without the chrome Streamdown puts on a code block,
 * because a message is read rather than edited. The size and the rhythm it is
 * read at belong to `styles.css`, which is where a message is told apart from a
 * document. Text that is still being written is read the other way: Streamdown
 * parses it as the incomplete markdown it is, animates the blocks as they
 * arrive, and holds a caret open where the writing has reached.
 */
const Markdown = ({ markdown, streaming = false }: { markdown: string; streaming?: boolean }) => (
  <Streamdown
    className="message-markdown"
    mode={streaming ? "streaming" : "static"}
    animated={streaming}
    isAnimating={streaming}
    caret={streaming ? "block" : undefined}
    plugins={plugins}
    lineNumbers={false}
    controls={false}
  >
    {markdown}
  </Streamdown>
);

/**
 * A text part, or the plain text of a system message, as markdown.
 *
 * **When to use**
 *
 * Use for what a message said, whether it arrived as a `text` part or as the
 * instruction of a system message.
 *
 * **Details**
 *
 * The text is markdown, which Streamdown renders and styles. The text sits in a
 * `Bubble` whose variant the caller picks: the same text is a filled bubble on
 * the user's side of the conversation and a ghost one on the model's.
 *
 * Text a response is still writing is the same text with `streaming` set: it is
 * read as the markdown that has arrived so far rather than as the markdown it
 * will be.
 *
 * @see {@link PromptTextVariant} for the variants to surface it in.
 * @see {@link ResponseStream} for the stream that reads a text as it arrives.
 * @category components
 */
export const PromptText = ({
  text,
  variant = "ghost",
  streaming = false,
}: {
  text: string;
  variant?: PromptTextVariant;
  streaming?: boolean;
}) => (
  <Bubble variant={variant}>
    <BubbleContent>
      <Markdown markdown={text} streaming={streaming} />
    </BubbleContent>
  </Bubble>
);

/**
 * A reasoning part, as what the model thought before it answered.
 *
 * **When to use**
 *
 * Use to show the thinking a model recorded, kept out of the way of its answer.
 *
 * **Details**
 *
 * The part is read by the text it holds, which a response's reasoning part holds
 * the same way.
 *
 * Thinking a response is still writing is the same part with `streaming` set: it
 * is open while it is being written and folds away once it has been written,
 * because a thought belongs to the answer it was written for and not to the
 * reader of it. The reader opening or closing the marker is what the panel
 * follows from then on, streamed or not.
 *
 * @see {@link PromptText} for the same rendering of an answer.
 * @see {@link ResponseStream} for the stream that reads thinking as it arrives.
 * @category components
 */
export const PromptReasoning = ({
  part,
  streaming = false,
}: {
  part: ReasoningPart;
  streaming?: boolean;
}) => {
  const [chosen, setChosen] = useState<boolean | undefined>(undefined);

  return (
    <Collapsible className="w-full" open={chosen ?? streaming} onOpenChange={setChosen}>
      <CollapsibleTrigger className="group/reasoning w-full text-left">
        <Marker render={<span />}>
          <MarkerIcon>{streaming ? <Spinner /> : <Sparkles />}</MarkerIcon>
          <MarkerContent>{streaming ? "Thinking…" : "Reasoning"}</MarkerContent>
          <ChevronDown className="transition-transform group-data-[panel-open]/reasoning:rotate-180" />
        </Marker>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Bubble variant="muted">
          <BubbleContent>
            <Markdown markdown={part.text} streaming={streaming} />
          </BubbleContent>
        </Bubble>
      </CollapsibleContent>
    </Collapsible>
  );
};

/**
 * A file part, as an attachment.
 *
 * **When to use**
 *
 * Use to show a file a message carried, named by the file name it recorded or
 * by its media type where it recorded none.
 *
 * **Details**
 *
 * A response's file part carries the bytes of the file and no name, so only its
 * media type names it.
 *
 * @see {@link fileDataOf} for what is shown of its payload.
 * @category components
 */
export const PromptFile = ({ part }: { part: FilePart }) => (
  <Attachment>
    <AttachmentMedia>
      <FileIcon />
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle>{part.fileName ?? part.mediaType}</AttachmentTitle>
      <AttachmentDescription>
        {`${part.mediaType} · ${fileDataOf(part.data)}`}
      </AttachmentDescription>
    </AttachmentContent>
  </Attachment>
);

/**
 * A tool call part, as the call the model made.
 *
 * **When to use**
 *
 * Use to show a tool a model asked for, with the parameters it asked with.
 *
 * **Details**
 *
 * The parameters are a recorded `unknown`, so they are shown as the JSON tree
 * {@link ToolPayload} renders rather than read as the toolkit's own types. A
 * response's tool call records the same call, and its parameters are read the
 * same way.
 *
 * @see {@link PromptToolResult} for the result the call is answered with.
 * @category components
 */
export const PromptToolCall = ({ part }: { part: ToolCallPart }) => (
  <Item variant="outline" className="w-full">
    <ItemMedia variant="icon">
      <Wrench />
    </ItemMedia>
    <ItemContent>
      <ItemTitle>
        {part.name}
        <Badge variant="secondary">tool call</Badge>
        {part.providerExecuted ? <Badge variant="outline">provider-executed</Badge> : null}
      </ItemTitle>
      <ItemDescription>{`call ${part.id}`}</ItemDescription>
      <ToolPayload payload={part.params} />
    </ItemContent>
  </Item>
);

/**
 * A tool result part, as the answer a call was given.
 *
 * **When to use**
 *
 * Use to show what a tool answered, whether it succeeded or failed.
 *
 * **Details**
 *
 * The answer is a recorded value rather than the toolkit's own type, whether it
 * was recorded by a prompt or returned by a response.
 *
 * @see {@link PromptToolCall} for the call it answers, named by the same id.
 * @category components
 */
export const PromptToolResult = ({ part }: { part: ToolResultPart }) => (
  <Item variant="outline" className={cn("w-full", part.isFailure && "border-destructive/40")}>
    <ItemMedia variant="icon">
      {part.isFailure ? <TriangleAlert className="text-destructive" /> : <Check />}
    </ItemMedia>
    <ItemContent>
      <ItemTitle>
        {part.name}
        <Badge variant={part.isFailure ? "destructive" : "secondary"}>
          {part.isFailure ? "failed" : "result"}
        </Badge>
      </ItemTitle>
      <ItemDescription>{`answers call ${part.id}`}</ItemDescription>
      <ToolPayload payload={part.result} />
    </ItemContent>
  </Item>
);

/**
 * An approval request part, as the decision a call is waiting on.
 *
 * **When to use**
 *
 * Use to show that a recorded call paused for a person to allow it.
 *
 * **Details**
 *
 * A response asks for a call to be approved the same way a prompt records that
 * it was, so one component reads both.
 *
 * @see {@link PromptToolApprovalResponse} for the decision it was answered with.
 * @category components
 */
export const PromptToolApprovalRequest = ({ part }: { part: ToolApprovalRequestPart }) => (
  <Alert>
    <ShieldQuestion />
    <AlertTitle>Approval requested</AlertTitle>
    <AlertDescription>
      {`call ${part.toolCallId} is waiting on ${part.approvalId}`}
    </AlertDescription>
  </Alert>
);

/**
 * An approval response part, as the decision a paused call was given.
 *
 * **When to use**
 *
 * Use to show whether a call that paused was allowed or denied, and why it was
 * denied.
 *
 * @see {@link PromptToolApprovalRequest} for the request it answers.
 * @category components
 */
export const PromptToolApprovalResponse = ({ part }: { part: Prompt.ToolApprovalResponsePart }) => (
  <Alert variant={part.approved ? "default" : "destructive"}>
    {part.approved ? <ShieldCheck /> : <ShieldX />}
    <AlertTitle>{part.approved ? "Approved" : "Denied"}</AlertTitle>
    <AlertDescription>
      {part.reason === undefined ? part.approvalId : `${part.approvalId} — ${part.reason}`}
    </AlertDescription>
  </Alert>
);

/**
 * A part is a value, not a component, so no `type` is ever read at runtime: the
 * call site stops compiling the moment `effect/ai` adds a part, which is where a
 * missing component should be noticed.
 */
const unmapped = (part: never): never => part;

/**
 * A part of a message, as the component that part is mapped to.
 *
 * **When to use**
 *
 * Use to render a message whose parts are known only as the union `effect/ai`
 * gives them, such as one read out of a recording.
 *
 * **Details**
 *
 * The dispatch is on the part's own `type`, which is also what TypeScript
 * narrows by, so every part `effect/ai` defines has a case and a part it adds
 * later stops compiling rather than rendering nothing. `textVariant` is handed
 * to {@link PromptText} alone: it is the message's role, not the part, that says
 * how a message's text should read.
 *
 * @see {@link PromptMessage} for the message this is a part of.
 * @category components
 */
export const PromptPart = ({
  part,
  textVariant,
}: {
  part: Prompt.Part;
  textVariant?: PromptTextVariant;
}) => {
  switch (part.type) {
    case "text":
      return <PromptText text={part.text} variant={textVariant} />;

    case "reasoning":
      return <PromptReasoning part={part} />;

    case "file":
      return <PromptFile part={part} />;

    case "tool-call":
      return <PromptToolCall part={part} />;

    case "tool-result":
      return <PromptToolResult part={part} />;

    case "tool-approval-request":
      return <PromptToolApprovalRequest part={part} />;

    case "tool-approval-response":
      return <PromptToolApprovalResponse part={part} />;

    default:
      return unmapped(part);
  }
};

/**
 * The role is the only thing a part does not carry, and it is the message's:
 * the same text is surfaced differently on the user's side of the conversation
 * than on the model's.
 */
const presentations: Record<
  Prompt.Message["role"],
  {
    readonly label: string;
    readonly align: "start" | "end";
    readonly variant: PromptTextVariant;
  }
> = {
  system: { label: "System", align: "start", variant: "outline" },
  user: { label: "User", align: "end", variant: "secondary" },
  assistant: { label: "Assistant", align: "start", variant: "ghost" },
  tool: { label: "Tool", align: "start", variant: "ghost" },
};

/**
 * A system message holds plain text rather than parts, so its instruction goes
 * through {@link PromptText} the way a text part does.
 */
const bodyOf = (message: Prompt.Message, variant: PromptTextVariant): ReactNode => {
  if (message.role === "system") {
    return <PromptText text={message.content} variant={variant} />;
  }

  // SAFETY: every role but `system` holds parts, and the three unions of them
  // are each a subset of `Prompt.Part`; the annotation gives the union of
  // arrays one element type to be read as.
  const parts: ReadonlyArray<Prompt.Part> = message.content;

  return parts.map((part, index) => <PromptPart key={index} part={part} textVariant={variant} />);
};

/**
 * A message, as a row of the conversation.
 *
 * **When to use**
 *
 * Use to render one message of a prompt — one message a model was given, or
 * what it answered with — with the parts it carries.
 *
 * **Details**
 *
 * Who contributed the message picks the side it sits on and who it is labelled
 * by, and its parts are rendered in the order they were recorded by
 * {@link PromptPart}. A prompt part carries no id of its own, so parts are keyed
 * by their position, which is stable for a prompt that is not rewritten under
 * the view.
 *
 * @see {@link PromptView} for a whole prompt.
 * @category components
 */
export const PromptMessage = ({ message }: { message: Prompt.Message }) => {
  const presentation = presentations[message.role];

  return (
    <Message align={presentation.align}>
      <MessageAvatar>
        <Avatar>
          <AvatarFallback>{presentation.label.slice(0, 1)}</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>{presentation.label}</MessageHeader>
        {bodyOf(message, presentation.variant)}
      </MessageContent>
    </Message>
  );
};

/**
 * A whole prompt, as the conversation it is.
 *
 * **When to use**
 *
 * Use to render the messages a model was given and the answers recorded for
 * them, such as to read a recorded turn as the dialogue it ran as.
 *
 * @see {@link PromptMessage} for the rows it is made of.
 * @category components
 */
export const PromptView = ({ prompt }: { prompt: Prompt.Prompt }) => (
  <MessageGroup className="gap-6">
    {prompt.content.map((message, index) => (
      <PromptMessage key={index} message={message} />
    ))}
  </MessageGroup>
);
