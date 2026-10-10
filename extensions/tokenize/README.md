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
