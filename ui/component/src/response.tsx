/**
 * The mapping from `effect/ai`'s response model to shadcn/ui's chat components:
 * {@link ResponseSource}, {@link ResponseMetadata} and {@link ResponseFinish}
 * for the parts only a response carries, with {@link ResponsePart} dispatching
 * on a part's `type` to those and to the components `prompt.tsx` renders the
 * shapes a response shares with a prompt by.
 *
 * Nothing is mapped twice: wherever a response part and a prompt part produce the
 * same thing, one component reads both, so the text of an answer, its reasoning,
 * its files and its tool calls are rendered as a prompt's are. Only the parts a
 * response is made of are here; `stream.tsx` is where the parts it is written in
 * are read.
 */

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@trajs/shadcn/collapsible";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@trajs/shadcn/item";
import { Marker, MarkerContent, MarkerIcon } from "@trajs/shadcn/marker";
import { DateTime } from "effect";
import type { Response, Tool } from "effect/ai";
import {
  ChevronDown,
  CircleCheck,
  CircleHelp,
  FileText,
  Flag,
  Info,
  Link,
  Pause,
  Scissors,
  ShieldX,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  PromptFile,
  PromptReasoning,
  PromptText,
  PromptToolApprovalRequest,
  PromptToolCall,
  PromptToolResult,
} from "./prompt.tsx";

/**
 * A response part, as a trajectory carries it: the toolkit a part was produced
 * with is not the toolkit it is read with, so the tool a part names is left
 * unconstrained.
 *
 * **When to use**
 *
 * Use to type a response whose parts were produced rather than built, such as the
 * answer a turn holds.
 *
 * @see {@link ResponsePart} for the component that dispatches over it.
 * @category models
 */
export type AnyResponsePart = Response.Part<Record<string, Tool.Any>>;

type SourcePart = Response.DocumentSourcePart | Response.UrlSourcePart;

/**
 * A source part, as what the model answered from.
 *
 * **When to use**
 *
 * Use to show the documents and URLs a model cited while answering.
 *
 * **Details**
 *
 * A URL is the link it points at: its title opens it in a new tab, and the URL
 * itself is read under the title. A document is named by its title, its media
 * type and the file name it produced where it produced one — the response holds
 * a reference to it, not its bytes, so nothing about the document is opened.
 *
 * @see {@link ResponsePart} for the dispatch that reaches this component.
 * @category components
 */
export const ResponseSource = ({ part }: { part: SourcePart }) => (
  <Item variant="outline" className="w-full">
    <ItemMedia variant="icon">{part.sourceType === "url" ? <Link /> : <FileText />}</ItemMedia>
    <ItemContent>
      <ItemTitle>
        {part.sourceType === "url" ? (
          <a href={part.url.toString()} rel="noreferrer" target="_blank">
            {part.title}
          </a>
        ) : (
          part.title
        )}
      </ItemTitle>
      <ItemDescription>
        {part.sourceType === "url"
          ? part.url.toString()
          : `${part.mediaType} · ${part.fileName ?? part.id}`}
      </ItemDescription>
    </ItemContent>
  </Item>
);

/**
 * The fields a metadata part produced, as the label and the value each is read
 * by. A request is read as the method and the URL it was sent to rather than as
 * the parameters and headers it carried.
 */
const fieldsOf = (
  part: Response.ResponseMetadataPart,
): ReadonlyArray<readonly [string, string]> => {
  const fields: Array<readonly [string, string]> = [];

  if (part.id !== undefined) fields.push(["id", part.id]);

  if (part.modelId !== undefined) fields.push(["model", part.modelId]);

  if (part.timestamp !== undefined) fields.push(["time", DateTime.formatIso(part.timestamp)]);

  if (part.request !== undefined) {
    fields.push(["request", `${part.request.method} ${part.request.url}`]);
  }

  return fields;
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2 font-mono text-xs leading-5">
    <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 break-all whitespace-pre-wrap">{value}</span>
  </div>
);

/**
 * A response metadata part, as what the response produced about itself.
 *
 * **When to use**
 *
 * Use to show which model answered, when, and what it was asked with, folded
 * away from the answer itself.
 *
 * **Details**
 *
 * A metadata part carries whichever fields the response produced and nothing of
 * the rest, so a part that produced none of them opens onto nothing.
 *
 * @see {@link ResponseFinish} for what the response ended with.
 * @category components
 */
export const ResponseMetadata = ({ part }: { part: Response.ResponseMetadataPart }) => (
  <Collapsible className="w-full">
    <CollapsibleTrigger className="group/metadata w-full text-left">
      <Marker render={<span />}>
        <MarkerIcon>
          <Info />
        </MarkerIcon>
        <MarkerContent>Response metadata</MarkerContent>
        <ChevronDown className="transition-transform group-data-[panel-open]/metadata:rotate-180" />
      </Marker>
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-2">
      <Item variant="muted" className="w-full">
        <ItemContent>
          {fieldsOf(part).map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </ItemContent>
      </Item>
    </CollapsibleContent>
  </Collapsible>
);

/**
 * The icon each finish reason is read with, so that the reasons a response
 * reached its own end by are told apart from the ones it was cut short by.
 */
const finishIcons: Record<Response.FinishReason, LucideIcon> = {
  stop: CircleCheck,
  length: Scissors,
  "content-filter": ShieldX,
  "tool-calls": Wrench,
  error: TriangleAlert,
  pause: Pause,
  other: Flag,
  unknown: CircleHelp,
};

/**
 * A token count, as the rounded number it is read as rather than as the exact
 * digits a provider reported: what a turn cost is read at a glance, and the
 * exact count is on the part for anything that needs it.
 */
const countOf = (tokens: number): string =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(tokens);

/**
 * The tokens a finish part reported, as the counts they are read by. Every count
 * a provider reports is optional, so one it left out is left out here rather
 * than shown as a zero.
 */
const tokensOf = (usage: Response.Usage): ReadonlyArray<string> => {
  const tokens: Array<string> = [];

  if (usage.inputTokens.total !== undefined) tokens.push(`${countOf(usage.inputTokens.total)} in`);

  if (usage.outputTokens.total !== undefined) {
    tokens.push(`${countOf(usage.outputTokens.total)} out`);
  }

  if (usage.inputTokens.cacheRead !== undefined) {
    tokens.push(`${countOf(usage.inputTokens.cacheRead)} cached`);
  }

  return tokens;
};

/**
 * A finish part, as what the response ended with.
 *
 * **When to use**
 *
 * Use to end an answer with why the model stopped generating it and what the
 * turn cost in tokens: the prompt's tokens, the response's, and the tokens the
 * provider read from its cache.
 *
 * **Details**
 *
 * The reason is shown as the provider produced it rather than translated, so a
 * reason this package has never heard of still reads. A count the provider did
 * not report is not shown, and a part that reported no usage at all is the
 * reason alone.
 *
 * @see {@link ResponseMetadata} for what the response produced about itself.
 * @category components
 */
export const ResponseFinish = ({ part }: { part: Response.FinishPart }) => {
  const Reason = finishIcons[part.reason];

  return (
    <Marker variant="separator">
      <MarkerIcon>
        <Reason />
      </MarkerIcon>
      <MarkerContent>{[part.reason, ...tokensOf(part.usage)].join(" · ")}</MarkerContent>
    </Marker>
  );
};

/**
 * A part is a value, not a component, so no `type` is ever read at runtime: the
 * call site stops compiling the moment `effect/ai` adds a part, which is where a
 * missing component should be noticed. {@link PromptPart} ends its dispatch the
 * same way.
 */
const unmapped = (part: never): never => part;

/**
 * A part of a response, as the component that part is mapped to.
 *
 * **When to use**
 *
 * Use to render a response whose parts are known only as the union `effect/ai`
 * gives them, such as the answer a turn produced.
 *
 * **Details**
 *
 * The dispatch is on the part's own `type`, which is also what TypeScript
 * narrows by, so every part `effect/ai` defines has a case and a part it adds
 * later stops compiling rather than rendering nothing. The shapes a prompt and
 * a response share are rendered by the same components: a response is the
 * model's, so its text reads as the assistant's ghost bubble, and the role a
 * prompt would carry is the only thing a response part does not have.
 *
 * @see {@link PromptPart} for the same dispatch over a prompt.
 * @category components
 */
export const ResponsePart = ({ part }: { part: AnyResponsePart }) => {
  switch (part.type) {
    case "text":
      return <PromptText text={part.text} />;

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

    case "source":
      return <ResponseSource part={part} />;

    case "response-metadata":
      return <ResponseMetadata part={part} />;

    case "finish":
      return <ResponseFinish part={part} />;

    default:
      return unmapped(part);
  }
};
