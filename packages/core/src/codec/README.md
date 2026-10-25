# @trajs/core/codec

A `@trajs/core` trajectory read as the conversations a model API takes.

A trajectory holds every session that ran, in one stream of parts, and what a model
API is handed is not that stream: it is one conversation per session, holding the
messages the session's model was given and answered in the order they were produced,
and what the session inherited from the one it continues from. `Anthropic.make`
reads the sessions of a trajectory as the conversations the Anthropic Messages API
takes, and `OpenAiCompat.make` as the messages a chat completions API of an
OpenAI-compatible client takes — the sessions `Session.main` read of it, stated the
way each API takes them.

## Usage

```ts
import { Effect } from "effect";
import { Anthropic, OpenAiCompat } from "@trajs/core/codec";

const root = await Effect.runPromise(Session.main(trajectory).pipe(Effect.provide(Cache.layer())));

// One conversation per session, keyed by the id of the session.
const anthropic = await Effect.runPromise(Anthropic.make(root));
const openAi = await Effect.runPromise(OpenAiCompat.make(root));
```

The conversations are read with `View.prompt` of `@trajs/core` — a session's
messages, preceded by what the sessions it continues from produced up to the part it
continues from — and each message is then written as the API of the codec states it.

## Anthropic

`Anthropic` reads the messages of the Anthropic Messages API.

- Every system message of a conversation is read as its `system`, since the API
  states the instructions of a call apart from the messages of the conversation,
  whether or not it was produced among them.
- A tool result is read on the user's side of the conversation, which is where the
  API states one, whether the trajectory holds it as a tool message of a prompt or as
  part of a response; a user message and the tool results following it are read as
  one message, since the API states the roles of a conversation alternating.
- The text of a message is carried as a text block, and an image as an image block:
  a location as the URL the API takes, and bytes as base64 of the media type they
  were given as. An image of a media type the API does not read — a document, or one
  of the caller's own — is left out rather than sent as one it cannot take.

```ts
const conversations = await Effect.runPromise(Anthropic.make(root));
const conversation = conversations[sessionId];

// The messages of the session, and the instructions of the call apart from them.
conversation?.messages.map((message) => message.role);
conversation?.system;
```

What a trajectory holds and no message states is left out rather than invented: a
model's reasoning, since the API takes a thinking block back only with the signature
it was returned with; a tool a provider executed itself and the result it answered
with, which are the provider's own record of a call it made; and the approval of a
tool call, which is an operation of the program that ran the tools rather than of the
conversation.

## OpenAI-compatible chat completions

`OpenAiCompat` reads the messages a chat completions API of an OpenAI-compatible
client takes.

- A prompt message is carried as the message of its own role, and a system message
  is left where it was produced rather than read apart from the conversation, since
  this API takes instructions anywhere.
- The response parts of a turn are carried as the messages they were produced as:
  the text and the tool calls a model answered with in one `assistant` message, and
  each tool result in a `tool` message of its own, which is where this API states
  one.
- The text of a message is carried as the string it is, and the images it was given
  as the parts of its content, where any of them is an image: a location or a data
  URL as it stands, and bytes as a data URL of the media type they were given as.

```ts
const conversations = await Effect.runPromise(OpenAiCompat.make(root));

conversations[sessionId]?.map((message) => message.role);
```

What a trajectory holds and no message states is left out rather than invented: a
model's reasoning, which this API states none of per message; a tool a provider
executed itself and the result it answered with, which are the provider's own account
of a call it made; a file part that is not an image, and an image the API does not
read; and the approval of a tool call, which is an operation of the program that ran
the tools rather than of the conversation.

## Reading a trajectory

Reading a trajectory this way needs the sessions it declares, so a trajectory whose
sessions cannot be read fails the way one read by `@trajs/core` does: an unproduced
fork, a late declaration, or a session no session part declares, is what reading one
here fails with.

## Development

The module is part of `@trajs/core`, so it is developed and checked from
`packages/core`: `vp check` reads it and `vp pack` builds it with the package.
