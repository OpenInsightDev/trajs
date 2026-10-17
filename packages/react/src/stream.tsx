/**
 * The mapping from a stream of response parts to the components that read it:
 * where `response.tsx` renders the parts a response is made of, this renders the
 * answer a stream is writing — {@link ResponseStream} reads the parts received so
 * far as the answer they have written, {@link ResponseToolParams} is the
 * parameters of a call that is still arriving, and {@link ResponseError} is the
 * error a stream reported in place of an answer.
 *
 * A stream part is not rendered one at a time: the increments of one chunk say the
 * text of one part, so reading them apart would read one bubble per increment.
 * A `*-start` opens a chunk where it is first written, its `*-delta` parts add to
 * it and its `*-end` closes it — the rule `@trajs/core` folds a stream
 * by — and an increment whose start is not among the parts read belongs to no
 * chunk. What a stream that has not ended has to say is what is left over: a chunk
 * that is still open reads as what has been written of it, and an error part,
 * which a trajectory of a finished turn carries nothing of, reads as itself.
 */

import { Alert, AlertDescription, AlertTitle } from "@trajs/ui/components/alert";
import { Badge } from "@trajs/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@trajs/ui/components/item";
import { MessageContent } from "@trajs/ui/components/message";
import { Spinner } from "@trajs/ui/components/spinner";
import type { Response, Tool } from "effect/ai";
import { TriangleAlert, Wrench } from "lucide-react";

import { PromptReasoning, PromptText } from "./prompt.tsx";
import { ResponsePart } from "./response.tsx";
import type { AnyResponsePart } from "./response.tsx";
import { ToolPayload } from "./tool-payload.tsx";

/**
 * A streaming response part, as a trajectory carries it: the toolkit a part was
 * produced with is not the toolkit it is read with, so the tool a part names is
 * left unconstrained.
 *
 * **When to use**
 *
 * Use to type the parts of a response that is still arriving, such as the ones a
 * handler accumulates as they come, rather than the parts of a response that is
 * whole.
 *
 * @see {@link ResponseStream} for the component that reads them.
 * @see {@link AnyResponsePart} for the parts of a response that is whole.
 * @category models
 */
export type AnyStreamPart = Response.StreamPart<Record<string, Tool.Any>>;

interface TextChunk {
  readonly kind: "Text";
  text: string;
  streaming: boolean;
}

interface ReasoningChunk {
  readonly kind: "Reasoning";
  text: string;
  streaming: boolean;
}

/**
 * A chunk of the parameters a stream is writing for a call, as the JSON fragments
 * they arrive as: the part carrying the parameters themselves is the call the
 * stream writes afterwards.
 */
interface ParamsChunk {
  readonly kind: "Params";
  readonly id: string;
  readonly name: string;
  readonly providerExecuted: boolean;
  parameters: string;
  streaming: boolean;
}

type WrittenParams = Pick<ParamsChunk, "id" | "name" | "providerExecuted" | "parameters">;

type Streamed =
  | TextChunk
  | ReasoningChunk
  | ParamsChunk
  | { readonly kind: "Part"; readonly part: AnyResponsePart }
  | { readonly kind: "Error"; readonly part: Response.ErrorPart };

/**
 * The parts a stream has written so far, as the entries to read them by, in the
 * order the stream produced them in.
 *
 * A chunk is opened by its first increment and takes its place among the entries
 * there, so the rest of its increments write into an entry already in position and
 * the answer reads in the order it was written in rather than in the order its
 * chunks were finished in.
 */
const streamed = (parts: ReadonlyArray<AnyStreamPart>): ReadonlyArray<Streamed> => {
  const entries: Array<Streamed> = [];
  const texts = new Map<string, TextChunk>();
  const reasonings = new Map<string, ReasoningChunk>();
  const params = new Map<string, ParamsChunk>();

  /** The chunk `id` names, opened where the part naming it is the first to. */
  const chunkOf = <Chunk extends Streamed>(
    chunks: Map<string, Chunk>,
    id: string,
    opened: () => Chunk,
  ): Chunk => {
    const open = chunks.get(id);

    if (open !== undefined) return open;

    const chunk = opened();
    chunks.set(id, chunk);
    entries.push(chunk);

    return chunk;
  };

  for (const part of parts) {
    switch (part.type) {
      case "text-start":
        chunkOf(texts, part.id, () => ({ kind: "Text", text: "", streaming: true }));
        break;

      case "text-delta": {
        const chunk = texts.get(part.id);

        if (chunk !== undefined) chunk.text += part.delta;

        break;
      }

      case "text-end": {
        const chunk = texts.get(part.id);

        if (chunk !== undefined) chunk.streaming = false;

        break;
      }

      case "reasoning-start":
        chunkOf(reasonings, part.id, () => ({ kind: "Reasoning", text: "", streaming: true }));
        break;

      case "reasoning-delta": {
        const chunk = reasonings.get(part.id);

        if (chunk !== undefined) chunk.text += part.delta;

        break;
      }

      case "reasoning-end": {
        const chunk = reasonings.get(part.id);

        if (chunk !== undefined) chunk.streaming = false;

        break;
      }

      case "tool-params-start":
        chunkOf(params, part.id, () => ({
          kind: "Params",
          id: part.id,
          name: part.name,
          providerExecuted: part.providerExecuted,
          parameters: "",
          streaming: true,
        }));
        break;

      case "tool-params-delta": {
        const chunk = params.get(part.id);

        if (chunk !== undefined) chunk.parameters += part.delta;

        break;
      }

      case "tool-params-end": {
        const chunk = params.get(part.id);

        if (chunk !== undefined) chunk.streaming = false;

        break;
      }

      case "error":
        entries.push({ kind: "Error", part });
        break;

      default:
        // Everything left is a part a response carries whole, which `ResponsePart`
        // renders — including a part `effect/ai` adds later, which stops compiling
        // here until this package reads it as well as the parts it is added beside.
        entries.push({ kind: "Part", part });
    }
  }

  return entries;
};

/**
 * The parameters a stream is writing for a call, as they have arrived so far.
 *
 * **When to use**
 *
 * Use to show a call while it is still being written, before the call itself is
 * produced: the parameters arrive as the JSON fragments a model is writing, and
 * the call arrives whole once they are done.
 *
 * **Details**
 *
 * The fragments are shown as the text they are rather than as a payload, because
 * they are not a payload yet: {@link ToolPayload} reads a value that is whole, and
 * half of one reads better as what the model is writing. Whether the call has
 * finished having its parameters written is what `streaming` says.
 *
 * A stream produces the parameters a call is written with and the call itself as
 * two parts, so what this reads is the writing of the parameters and not the call
 * they are the parameters of: a call is read where it is produced, by
 * {@link PromptToolCall}.
 *
 * @see {@link PromptToolCall} for the call these parameters belong to.
 * @category components
 */
export const ResponseToolParams = ({
  part,
  streaming = false,
}: {
  part: WrittenParams;
  streaming?: boolean;
}) => (
  <Item variant="outline" className="w-full">
    <ItemMedia variant="icon">{streaming ? <Spinner /> : <Wrench />}</ItemMedia>
    <ItemContent>
      <ItemTitle>
        {part.name}
        <Badge variant="secondary">{streaming ? "writing parameters" : "parameters written"}</Badge>
        {part.providerExecuted ? <Badge variant="outline">provider-executed</Badge> : null}
      </ItemTitle>
      <ItemDescription>{`call ${part.id}`}</ItemDescription>
      <span className="font-mono text-xs break-all whitespace-pre-wrap">{part.parameters}</span>
    </ItemContent>
  </Item>
);

/**
 * An error part, as the error a stream reported.
 *
 * **When to use**
 *
 * Use to show that a response failed while it was being written, in place of the
 * answer that was expected of it.
 *
 * **Details**
 *
 * What a provider produced as the error is its own, so it is read as the JSON
 * value it is rather than as a message. An error part belongs to a stream and not
 * to a response: the parts a response is made of do not include one, so a
 * trajectory of a finished turn reads past it.
 *
 * @see {@link ResponseStream} for the stream that reads it.
 * @category components
 */
export const ResponseError = ({ part }: { part: Response.ErrorPart }) => (
  <Alert variant="destructive">
    <TriangleAlert />
    <AlertTitle>Response error</AlertTitle>
    <AlertDescription>
      <ToolPayload payload={part.error} />
    </AlertDescription>
  </Alert>
);

const StreamedEntry = ({ entry }: { entry: Streamed }) => {
  switch (entry.kind) {
    case "Text":
      return <PromptText text={entry.text} streaming={entry.streaming} />;

    case "Reasoning":
      return <PromptReasoning part={entry} streaming={entry.streaming} />;

    case "Params":
      return <ResponseToolParams part={entry} streaming={entry.streaming} />;

    case "Error":
      return <ResponseError part={entry.part} />;

    case "Part":
      return <ResponsePart part={entry.part} />;
  }
};

/**
 * The answer a stream of response parts has written so far.
 *
 * **When to use**
 *
 * Use to render a response that is still arriving, from the parts that have
 * arrived: the text of an answer grows where it is being written, the thinking
 * behind it is open while it is being thought, and a call is shown with the
 * parameters it is being written with. A response that is whole is rendered by
 * {@link ResponsePart}, which reads it a part at a time.
 *
 * **Details**
 *
 * The parts are read in the order they were produced in, and the increments of one
 * chunk are one entry: a chunk is opened where its first increment sits, so an
 * answer reads down the page the way it was written, and a chunk keeps its place
 * in it for as long as the stream is read, since a stream only ever adds to the
 * end of one. A chunk the stream has not closed is read in the streaming state of
 * the component its part maps to — the text as far as it has been written, the
 * thinking still open, the parameters as the fragments they are — which is what
 * tells a reader that the answer is not finished.
 *
 * @see {@link AnyStreamPart} for the parts it reads.
 * @see {@link PromptText} and {@link PromptReasoning} for the streaming state.
 * @category components
 */
export const ResponseStream = ({ parts }: { parts: ReadonlyArray<AnyStreamPart> }) => (
  <MessageContent>
    {streamed(parts).map((entry, index) => (
      <StreamedEntry key={index} entry={entry} />
    ))}
  </MessageContent>
);
