# @trajs/extension-anthropic

A `@trajs/core` recording read as the conversations the Anthropic Messages API
takes.

A trajectory holds every session a recording ran in one stream of parts, and what the
API is handed is not that stream: it is one conversation per session, holding the
messages the session's model was given and answered in the order they were recorded,
and what the session inherited from the one it continues from.
`Codec.makeAnthropic` reads a recording as those conversations, stated the way the
API takes them. It is what the package is for, so it is re-exported as a namespace;
it is also available as the subpath import `@trajs/extension-anthropic/Codec`.

## Usage

```ts
import { Effect } from "effect";
import { Codec } from "@trajs/extension-anthropic";

const sessions = await Effect.runPromise(Codec.makeAnthropic(recording));
const conversation = sessions[sessionId];

// The messages of the session, and the instructions of the call apart from them.
conversation?.messages.map((message) => message.role);
conversation?.system;
```

The conversations are read with `View.conversations` of `@trajs/core` — a session's
messages, preceded by what the sessions it continues from recorded up to the part it
continues from — and each message is then written as the API states it:

- Every system message of a conversation is read as its `system`, since the API
  states the instructions of a call apart from the messages of the conversation,
  whether or not it was recorded among them.
- A tool result is read on the user's side of the conversation, which is where the
  API states one, whether the recording holds it as a tool message of a prompt or as
  part of a response; a user message and the tool results following it are read as
  one message, since the API states the roles of a conversation alternating.
- The text of a message is carried as a text block, and an image as an image block:
  a location as the URL the API takes, and bytes as base64 of the media type they
  were given as. An image of a media type the API does not read — a document, or one
  of the caller's own — is left out rather than sent as one it cannot take.

What a recording holds and no message states is left out rather than invented: a
model's reasoning, since the API takes a thinking block back only with the signature
it was returned with; a tool a provider executed itself and the result it answered
with, which are the provider's own record of a call it made; and the approval of a
tool call, which is an operation of the program that ran the tools rather than of the
conversation.

Reading a recording this way needs the sessions it declares, so a recording whose
sessions cannot be read fails the way one read by `@trajs/core` does: an unrecorded
fork, or a late declaration, is what reading one here fails with.

## Development

- Install dependencies:

```bash
vp install
```

- Run the unit tests:

```bash
vp test
```

- Build the library:

```bash
vp pack
```
