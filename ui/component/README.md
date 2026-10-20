# @trajs/ui-component

The trajs component library: React components that render an
[`effect/ai`](https://effect.website) prompt and response as the conversation
they are, with the [shadcn/ui](https://ui.shadcn.com) chat components of
[`@trajs/ui-shadcn`](../shadcn).

An `effect/ai` prompt is a value — messages, and the parts each message carries —
and every part has a shape only the union knows. This package is the mapping from
that union onto a component: `PromptPart` dispatches on a part's `type`, and
`PromptMessage` and `PromptView` lay a message or a whole prompt out. The dispatch
has a case per part and no default, so a part `effect/ai` adds later stops
compiling rather than rendering nothing.

```tsx
import { PromptView } from "@trajs/ui-component";

<PromptView prompt={prompt} />;
```

| Export                       | Renders                                           |
| ---------------------------- | ------------------------------------------------- |
| `PromptView`                 | a whole prompt, as the conversation it is         |
| `PromptMessage`              | one message, on the side its role sits on         |
| `PromptPart`                 | one part, dispatched on its `type`                |
| `PromptText`                 | a text part, as markdown in a bubble              |
| `PromptReasoning`            | a reasoning part, folded away                     |
| `PromptFile`                 | a file part, as an attachment                     |
| `PromptToolCall`             | a tool call, with the parameters it was made with |
| `PromptToolResult`           | what a tool answered, success or failure          |
| `PromptToolApprovalRequest`  | a call paused for a person to allow               |
| `PromptToolApprovalResponse` | the decision a paused call was given              |
| `ToolPayload`                | the JSON tree a tool payload is read in           |
| `PromptTextVariant`          | the bubble variants `PromptText` accepts          |

Prompts and responses are built with `effect/ai`'s own constructors; nothing here
requests a model or reads a trajectory.

## Responses

A response is the other half of a turn: the parts a model returned, which
`effect/ai` types as its own union. Wherever a response part and a prompt part
produce the same thing, the components above read both — a response's text reads
as the assistant's bubble, its tool call as the call it was — and `ResponsePart`
dispatches over the response union the way `PromptPart` does, so a part only a
response carries is the only thing left to render.

```tsx
import { ResponsePart } from "@trajs/ui-component";

<ResponsePart part={part} />;
```

| Export               | Renders                                              |
| -------------------- | ---------------------------------------------------- |
| `ResponsePart`       | one response part, dispatched on its `type`          |
| `ResponseSource`     | a document or URL the answer was given from          |
| `ResponseMetadata`   | what the response produced about itself, folded away |
| `ResponseFinish`     | why it stopped, and what the turn cost in tokens     |
| `ResponseStream`     | an answer that is still arriving, from its parts     |
| `ResponseToolParams` | the parameters of a call that is still being written |
| `ResponseError`      | the error a stream reported in place of an answer    |
| `AnyResponsePart`    | the union `ResponsePart` dispatches over             |
| `AnyStreamPart`      | the union `ResponseStream` reads                     |

A response has no role, so its text reads the way an assistant's does.

## Streaming

A response can also be read while it is still arriving. `effect/ai` types that
half of the model as `Response.StreamPart`: the parts a response is made of, plus
the increments it is written in — the `text-start` / `text-delta` / `text-end`
parts of a text, the same three for reasoning, the `tool-params-*` parts a call's
parameters arrive as, and the `error` part a response can end in. `ResponseStream`
reads the parts received so far as the answer they have written:

```tsx
import { ResponseStream } from "@trajs/ui-component";
import type { AnyStreamPart } from "@trajs/ui-component";

// every part the stream has delivered so far, in the order it delivered them
const [parts, setParts] = useState<ReadonlyArray<AnyStreamPart>>([]);

<ResponseStream parts={parts} />;
```

A chunk of increments is one entry, opened where its first increment sits, so an
answer reads down the page the way it was written rather than as a bubble per
increment. What the stream has not closed is read in the streaming state of the
component its part maps to: `PromptText` and `PromptReasoning` take a `streaming`
prop, which reads the text as the incomplete markdown it is — with a caret where
the writing has reached — and keeps the thinking open until it has been thought.
`ResponseToolParams` is the parameters of a call still being written, as the JSON
fragments they are arriving as, and `ResponseError` is what a stream reports
instead of an answer.

[`@trajs/core`](../../packages/core) folds the same increments into the parts they complete
when it reads a trajectory, because a trajectory has ended and nothing of it is
still open. Here it is what is open that is worth showing.

## The mark

The mark trajs is drawn with is held here too, as components rather than as files,
so that each front end draws it in its own colour and at its own size instead of
loading the same one:

| Export | Renders                                     |
| ------ | ------------------------------------------- |
| `Logo` | the mark, with the wordmark beside it       |
| `Icon` | the mark alone, for a square or a tall slot |

The logo is the icon and the letters: the mark is one path, drawn in both, and
both boxes are 146 tall, so a header and a favicon draw the mark the same size.

What a mark looks like where it is drawn is the caller's, and is said with classes
rather than with props of this package's own: `stroke-[4]` for the weight of the
mark's lines, `stroke-*`/`fill-*`/`text-*` for colour — the mark is stroked in
`currentColor`, the letters filled in it — and `h-*`/`w-*` for the size. Each has
a default in the markup that a class overrides. The drawing is not the caller's:
the paths, the weight they default to, the gap between the mark and the letters,
and the boxes they sit in. The path data behind them is the export rounded to two
decimals with a command to a line, and the wordmark is held as the five letters it
is made of, so a stroke of the mark or a letter of the name can be found and moved
without a vector tool.

## Installing

The package renders with the components in [`@trajs/ui-shadcn`](../shadcn), which is a
dependency of it, and with shadcn's semantic tokens, which the app owns. An app
that already has shadcn/ui set up needs only this:

```tsx
import { PromptView } from "@trajs/ui-component";
```

```css
@import "tailwindcss";
@import "@trajs/ui-component/styles.css";

/* Tailwind reads the classes the components are styled with from the built
   packages and from Streamdown, which live outside the app's own sources. */
@source "../node_modules/@trajs/ui-component/dist";
@source "../node_modules/@trajs/ui-shadcn/dist";
@source "../node_modules/streamdown/dist/*.js";
@source "../node_modules/@streamdown/code/dist/*.js";
```

`styles.css` carries the two things the mapping decides rather than inherits: a
message is read at the size and with the rhythm of the conversation it sits in
rather than of a document, and a code block in a message a trajectory holds is one quiet
surface with no playground around it. It also imports Streamdown's own
stylesheet, which is what the markdown is animated with.

## Markdown and tool payloads

[Streamdown](https://streamdown.ai) renders what a message _says_ and styles it
too — headings, lists, quotes, tables, code blocks — so nothing else is put over
the same elements. Its code blocks are highlighted by Shiki through
[`@streamdown/code`](https://streamdown.ai/docs/plugins/code).

A tool part's parameters and result are `unknown`: `effect/ai` types them by the
toolkit the part was built from, and a part a trajectory holds is read without one.
`ToolPayload` renders them with
[`react-json-view-lite`](https://github.com/AnyRoad/react-json-view-lite), whose
own stylesheet is not used — the tree is drawn with the app's tokens instead, so
it keeps the theme of the card it sits in.

## Building

```bash
vp pack   # into dist/, with types
vp dev    # vp pack --watch
```
