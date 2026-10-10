# @trajs/extension-tokenize

Byte-pair tokenization and token counts, built on Effect.

A tokenizer answers which tokens a text becomes and which text a list of tokens
decodes to, and is offered as a `Context.Service`: `encode`, `decode` and `count`
are Effect programs, byte-pair merges are memoized in an Effect `Cache`, and text
holding a special token the call does not allow fails with a typed error instead
of being encoded as ordinary text.

## Usage

```ts
import { Effect } from "effect";
import { Tokenizer } from "@trajs/extension-tokenize";

const program = Effect.gen(function* () {
  const tokenizer = yield* Tokenizer.Tokenizer;

  return yield* tokenizer.count("some text input");
});

const total = await Effect.runPromise(
  program.pipe(Effect.provide(Tokenizer.Tokenizer.layer("o200k_base"))),
);
```

`Tokenizer.layer` takes one of the encodings the package ships — `cl100k_base`,
`o200k_base`, `p50k_base` and `claude`, listed as `Tokenizer.encodingNames`. Each
is kept as the rank source its model publishes, so it is read when a tokenizer is
built from it, taking a few hundred milliseconds, and never when the package is
imported; a read encoding is reused by later tokenizers. The shipped sources are
the ones `coder/ai-tokenizer` keeps for those models.

To tokenize with an encoding the package does not ship, give its generated data
to `Tokenizer.layerFromEncoding` — see the `Encoding` module for the storage that
call takes.

## Counting a recorded part

`Count.promptPart` and `Count.responsePart` estimate what one part of a recording
is worth under a tokenizer, with the rules `ai-tokenizer` estimates an AI SDK
message with: text and reasoning are their text, a tool call is its name and the
JSON of its parameters, a tool result is its identifier and its result, and an
image or a file is a fixed estimate. A prompt part also counts the role of each
of its messages. The overhead a model adds around the parts — a base cost per
request, a cost per message or per tool, and a content multiplier — is not
included, because trajs records no model configuration.

```ts
import { Count } from "@trajs/extension-tokenize";

const total = await Effect.runPromise(
  Effect.gen(function* () {
    const tokenizer = yield* Tokenizer.Tokenizer;

    return yield* Count.promptPart(part, tokenizer);
  }).pipe(Effect.provide(layer)),
);
```

An image or a file cannot be counted, only estimated: a model charges for an
image its own base tokens plus tiles counted over the image's pixels, so the 85
and 100 tokens `ai-tokenizer` uses are placeholders. Name the family being
counted for, and the image's own header decides the size — nothing is guessed
from a model's name:

```ts
const total = await Effect.runPromise(
  Effect.gen(function* () {
    const tokenizer = yield* Tokenizer.Tokenizer;

    return yield* Count.promptPart(part, tokenizer, { media: "openai" });
  }).pipe(Effect.provide(layer)),
);
```

`"openai"` charges 85 tokens plus 170 for every 512px tile and `"anthropic"` a
token per 750 pixels, up to 1568 for one image. Another generation of a family is
`Count.openAiRule({ base: 70, tile: 140 })`, and anything else is a rule of your
own, which is handed the payload and the size `Count` read out of it:

```ts
const media = (_payload: Count.MediaPart, size: Count.ImageSize | undefined) =>
  size === undefined ? Count.mediaTokens(_payload) : size.width + size.height;
```

A recording that carries the usage a provider reported — a `finish` part does —
holds the exact number, so prefer it over any estimate.

A list of parts is counted in one pass with the tokenizer applied first:

```ts
const totals = await Effect.runPromise(
  Effect.gen(function* () {
    const tokenizer = yield* Tokenizer.Tokenizer;

    return yield* Effect.forEach(parts, Count.responsePart(tokenizer));
  }).pipe(Effect.provide(layer)),
);
```

## Recording the counts

A count is worth keeping: computing it again costs a pass over every part, and the
recording outlives the tokenizer that produced it. The package's `Extension` module
records what a part is worth as the `org.js.tra.tokenize` extension, so the counts
travel with the recording and a reader that installs the extension gets them back
with their types. It is re-exported directly from the package, because it is what
the package is for:

```ts
import { annotate, of } from "@trajs/extension-tokenize";

// What one part is worth, anchored to that part by its uuid.
const estimate = await Effect.runPromise(of(part, tokenizer));

// A whole recording, for the parts whose messages carry the kinds `tags` names.
const annotated = annotate(trajectory, tokenizer, { tags: ["text"] });
```

`annotate` emits an estimate directly after every part whose messages carry a
message part of a kind `tags` names — every part a tokenizer can count when it is
omitted — and carries the toolkit, the metadata and the extension kit over, its kit
extended with the extension. The kinds are the `type` of a message part that
carries content: `text`, `reasoning`, `tool-call`, `tool-result` and `file`. The
kinds that carry meta information instead — `tool-approval-request`,
`tool-approval-response`, `source`, `response-metadata` and `finish` — hold nothing
a tokenizer answers for, so a count is not taken from them and they are not tags.
The count is the part's own whichever kinds selected it, because the kinds decide
which parts are annotated rather than what a count covers. A recording written that
way decodes the estimates back with `Extensionkit.extkits(extensions)`, the way any
other extension data is rebound.

Each datum carries the estimate and how it was taken: `tokens`, the `encoding` it
was counted under, `mediaTokens`, how many of those tokens a rule on a payload that
is not text priced, and `media` when a family was named to do the pricing. It says
nothing about the part it is about — the extension part's `attach` names that part,
so the datum does not repeat its kind or its content. `tokens` is an estimate, not
the usage a provider reported: a `finish` part holds the exact whole-request
figure, and that is where the exact number should be read from.

The datum's shape is versioned the way any extension's is: `0.1.0` is the oldest
version, written out, and `0.1.1` is derived from it with `Extension.upgrade` from
`@trajs/core` — the version that added `mediaTokens`. `Estimate` is the newest
shape, `extension` the newest extension, and `registry` the extension as of each
version, keyed by the version literal with `latest` naming the newest. Each entry
reads the versions up to it and writes the one it is keyed by, so an earlier entry
neither accepts nor emits data of a later one:

```ts
import { Extensionkit } from "@trajs/core";
import { registry } from "@trajs/extension-tokenize";

// The extension as of one version, to write or read that version deliberately.
Extensionkit.make(registry["0.1.0"]);

// The newest version, whatever it is; the same as `extension`.
Extensionkit.make(registry.latest);
```

A datum recorded at an older version reads as the newest one through the line —
`Extensionkit.extkits(extensions)` does it for a whole recording — and a field the
older datum cannot supply stays absent rather than being guessed: a datum recorded
at `0.1.0` states no `mediaTokens`. Adding a version is deriving the newest entry
once and keying it in the registry, with every earlier datum pinned to read forward
as it; the `Extension` module states what that change looks like.

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
