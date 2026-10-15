# @trajs/extension-tokenize

Byte-pair token counts of a recording's parts, built on Effect and Effect AI's
`Tokenizer` service.

Which tokens a text becomes is not one function of the text: it depends on the
provider, the model and the encoding rules that model counts with. The tokenizer
is therefore `effect/ai`'s `Tokenizer` — a `Context.Service` a program depends on,
whose counting an implementation supplies — and this package supplies two of them:
`Tokenizer.layerOpenAi` counts the way an OpenAI model does, and
`Tokenizer.layerAnthropic` the way Anthropic's models do.

## Usage

```ts
import { Effect } from "effect";
import { Tokenizer } from "@trajs/extension-tokenize";

const program = Effect.gen(function* () {
  const tokenizer = yield* Tokenizer.Tokenizer;

  return yield* tokenizer.tokenize("some text input");
});

// The tokens an OpenAI model of that family would see.
const tokens = await Effect.runPromise(
  program.pipe(Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" }))),
);
```

`Tokenizer.layerOpenAi` counts with `gpt-tokenizer`, under the encoding that
package gives the model, which is why the model is named: `gpt-4o` and
`gpt-3.5-turbo` do not tokenize the same text into the same tokens. A model the
package does not list is counted with the encoding of the newest models,
`o200k_base`. `Tokenizer.layerAnthropic` counts with `@anthropic-ai/tokenizer`,
over the ranks Anthropic publishes, and takes no options.

The encoding's ranks are read when a layer is built rather than when the package is
imported, so a tokenizer built for `gpt-4o` loads that family's ranks alone. Either
implementation counts the text a prompt carries — the text of its messages, the
name and parameters of a tool call, the identifier and result of a tool result —
and not the framing a provider adds around messages, which nothing a recording
holds states.

`Tokenizer.Tokenizer` is `effect/ai`'s tag, identifier included, so the tokenizer a
run was provided with is the tokenizer any other package expects, and one the run
carries is what `Count` reads.

## Counting a recorded part

`Count.promptPart` and `Count.responsePart` estimate what one part of a recording
is worth, with the rules `ai-tokenizer` estimates an AI SDK message with: text and
reasoning are their text, a tool call is its name and the JSON of its parameters, a
tool result is its identifier and its result, and an image or a file is a fixed
estimate. A prompt part also counts the role of each of its messages. The overhead
a model adds around the parts — a base cost per request, a cost per message or per
tool, and a content multiplier — is not included, because trajs records no model
configuration.

Counting asks the run for its tokenizer rather than being handed one, so a count
is taken with whatever layer the run was provided with:

```ts
import { Count, Tokenizer } from "@trajs/extension-tokenize";

const layer = Tokenizer.layerOpenAi({ model: "gpt-4o" });

const total = await Effect.runPromise(Count.promptPart(part).pipe(Effect.provide(layer)));
```

An image or a file cannot be counted, only estimated: a model charges for an
image its own base tokens, plus tiles or patches counted over the image's pixels,
so the 85 and 100 tokens `ai-tokenizer` uses are placeholders. Name the family
being counted for, and the image's own header decides the size — nothing is
guessed from a model's name:

```ts
const total = await Effect.runPromise(
  Count.promptPart(part, { media: "openai" }).pipe(Effect.provide(layer)),
);
```

`"openai"` charges 85 tokens plus 170 for every 512px tile and `"anthropic"` a
token for each 28px patch, which are the rules the providers publish today
([OpenAI](https://platform.openai.com/docs/guides/images-vision#tile-based-image-tokenization),
[Anthropic](https://platform.claude.com/docs/en/build-with-claude/vision#evaluate-image-size)).
Another generation of a family is `Count.openAiRule({ base: 70, tile: 140 })`, a
model that counts in patches is `Count.openAiPatchRule({ multiplier: 1.62 })`,
and anything else is a rule of your own, which is handed the payload and the size
`Count` read out of it:

```ts
const media = (_payload: Count.MediaPart, size: Count.ImageSize | undefined) =>
  size === undefined ? Count.mediaTokens(_payload) : size.width + size.height;
```

A recording that carries the usage a provider reported — a `finish` part does —
holds the exact number, so prefer it over any estimate.

A list of parts is counted in one pass:

```ts
const totals = await Effect.runPromise(
  Effect.forEach(parts, Count.responsePart).pipe(Effect.provide(layer)),
);
```

## Recording the counts

A count is worth keeping: computing it again costs a pass over every part, and the
recording outlives the tokenizer that produced it. The package's `Extension` module
records what a part is worth as the `org.js.tra.tokenize` extension, so the counts
travel with the recording and a reader that installs the extension gets them back
with their types. It is re-exported directly from the package, because it is what
the package is for: what it offers is the extension and the producer a kit derives
its data with.

```ts
import { Tokenizer, extensions, latest, makeProducer } from "@trajs/extension-tokenize";
import { Extensionkit } from "@trajs/core";
import { Effect } from "effect";

// The tokenizer is the extension's own dependency, so it is provided around the
// producer rather than around the kit that runs it: the kit is built knowing
// nothing of it, and a part the tokenizer fails on is recorded as the
// extension's own failure rather than failing the run.
const producer = await Effect.runPromise(
  makeProducer().pipe(Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" }))),
);

const extkit = Extensionkit.toProducers(Extensionkit.make(extensions), {
  [latest.id]: producer,
});

// What the kit derived of a recording: one datum per part it counted, each
// anchored to the part it was taken for by that part's uuid.
const estimates = Extensionkit.produce(extkit)(recording);
```

`makeProducer(options)` builds the producer of the extension, and a kit runs it
over the messages a model was given and returned rather than over the parts a
recording arrived in. Everything else a recording needs belongs to the kit rather
than to the producer: `Extensionkit.produce` folds the increments a streamed
response arrived in, drops the data an earlier run derived, and fails with the
recording's failure, and writing what was produced back as the recording's own
parts is a step of the kit as well.

Name kinds of message part with `tags` to count the parts that carry those kinds
alone — every part a tokenizer can count when it is omitted. The kinds are the
`type` of a message part that carries content: `text`, `reasoning`, `tool-call`,
`tool-result` and `file`. The kinds that carry meta information instead —
`tool-approval-request`, `tool-approval-response`, `source`, `response-metadata`
and `finish` — hold nothing a tokenizer answers for, so a count is not taken from
them and they are not tags. The count is the part's own whichever kinds selected
it, because the kinds decide which parts are counted rather than what a count
covers.

The tokenizer is the extension's own dependency, so `makeProducer` is not given
one: which tokenizer a recording is counted with is chosen where the producer is
provided with a layer, and travels with the producer rather than with the kit
that runs it.

Each datum carries the estimate and how it was taken: `tokens`, the estimated
count, `mediaTokens`, how many of those tokens a rule on a payload that is not text
priced, and `media` when a family was named to do the pricing. Which tokenizer took
the count is not among them: a tokenizer states no name, and which one a run
carries is a property of the run rather than of the recording. The datum says
nothing about the part it is about — the derived part's `attach` names that part,
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
import { registry } from "@trajs/extension-tokenize";

// The entry of one version, to read or write that version deliberately.
const before = registry["0.1.0"];

// It is installed the way any extension is: an entry of a kit, keyed by its id.
const kit = { [before.id]: before };
```

A datum recorded at an older version reads as the newest one through the schema — a
kit that keys an entry reads every datum as of the version that entry writes — and a
field the older datum cannot supply stays absent rather than being guessed: a datum
recorded at `0.1.0` states no `mediaTokens`. Adding a version is deriving the newest
entry once and keying it in the registry, with every earlier datum pinned to read
forward as it; the `Extension` module states what that change looks like.

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
