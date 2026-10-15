# @trajs/extension-openai-compat

A `@trajs/core` recording read as the messages a chat completions API of an
OpenAI-compatible client takes.

A trajectory holds every session a recording ran in one stream of parts, and what a
chat completions API is handed is not that stream: it is one conversation per
session, holding the messages the session's model was given and answered in the
order they were recorded, and what the session inherited from the one it continues
from. `Codec.makeOpenAiCompat` reads a recording as those conversations, stated the
way that API takes them. It is what the package is for, so it is re-exported as a
namespace; it is also available as the subpath import
`@trajs/extension-openai-compat/Codec`.

## Usage

```ts
import { Effect } from "effect";
import { Codec } from "@trajs/extension-openai-compat";

const sessions = await Effect.runPromise(Codec.makeOpenAiCompat(recording));

// One conversation per session, keyed by the id of the session.
sessions[sessionId]?.map((message) => message.role);
```

The conversations are read with `View.conversations` of `@trajs/core` — a session's
messages, preceded by what the sessions it continues from recorded up to the part it
continues from — and each message is then written as the API states it:

- A prompt message is carried as the message of its own role, and a system message
  is left where it was recorded rather than read apart from the conversation, since
  this API takes instructions anywhere.
- The response parts of a turn are carried as the messages they were recorded as:
  the text and the tool calls a model answered with in one `assistant` message, and
  each tool result in a `tool` message of its own, which is where this API states
  one.
- The text of a message is carried as the string it is, and the images it was given
  as the parts of its content, where any of them is an image: a location or a data
  URL as it stands, and bytes as a data URL of the media type they were given as.

What a recording holds and no message states is left out rather than invented: a
model's reasoning, which this API states none of per message; a tool a provider
executed itself and the result it answered with, which are the provider's own record
of a call it made; a file part that is not an image, and an image the API does not
read; and the approval of a tool call, which is an operation of the program that ran
the tools rather than of the conversation.

Reading a recording this way needs the sessions it declares, so what a recording
whose sessions cannot be read fails with — an unrecorded fork, a late declaration —
is what reading one here fails with.

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
