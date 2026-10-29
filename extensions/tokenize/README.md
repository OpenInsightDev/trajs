# @trajs/extension-tokenize

Byte-pair token counts of a trajectory's parts, built on Effect and Effect AI's
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
and not the framing a provider adds around messages, which nothing a trajectory
holds states.

`Tokenizer.Tokenizer` is `effect/ai`'s tag, identifier included, so the tokenizer a
run was provided with is the tokenizer any other package expects, and one the run
carries is what `Count` reads.

## Counting a part a trajectory holds

`Count.promptPart` and `Count.responsePart` estimate what one part of a trajectory
is worth, with the rules `ai-tokenizer` estimates an AI SDK message with: text and
reasoning are their text, a tool call is its name and the JSON of its parameters, a
tool result is its identifier and its result, and an image or a file is a fixed
estimate. The role of a message is not counted, because it is framing a provider
adds around what was said rather than information a trajectory holds. The overhead a
model adds around the parts — a base cost per request, a cost per message or per
tool, and a content multiplier — is not counted either, because a trajectory holds
no model configuration.

A count is not one number, so what a count states is the schema of the kind of
part it was taken for — the `Tokens` module holds them. A prompt is many messages
at once, so `Count.promptPart` states the tokens of every kind of information the
prompt carries beside the total those kinds sum to:

```ts
import { Count, Tokenizer } from "@trajs/extension-tokenize";

const layer = Tokenizer.layerOpenAi({ model: "gpt-4o" });

const count = await Effect.runPromise(Count.promptPart(part).pipe(Effect.provide(layer)));

count.tokens; // what the whole prompt is worth
count.reasoning; // what the model's own reasoning is worth
count.toolResult; // what the results of the tools it called are worth
```

A response is one message part, so `Count.responsePart` states the kind of part it
was, tagged by the `type` of that part — `text`, `reasoning`, `tool-call`,
`tool-result` and `file` — each stating the part's `tokens` and how many of them a
rule priced, `mediaTokens`. A tool result states `toolCallTokens` as well, what the
call it answers is worth with it. A result always answers a call, and that call is
read from the trajectory the result belongs to rather than from the result itself,
so a tool result counted on its own is one no count is taken from — the metric's
producer states it instead, see below.

```ts
import { Option } from "effect";

const count = await Effect.runPromise(Count.responsePart(part).pipe(Effect.provide(layer)));

Option.map(count, (count) => count._tag); // Some("text") | Some("reasoning") | …
Option.map(count, (count) => count.tokens);
```

A part that carries nothing a tokenizer answers for — the source of a response,
its metadata, its finish, the approval of a call — is one no count is taken from
either, so `Count.responsePart` gives back `Option.none()` for it.

An image or a file cannot be counted, only estimated: a model charges for an
image its own base tokens, plus tiles or patches counted over the image's pixels,
so the 85 and 100 tokens `ai-tokenizer` uses are placeholders. Name the family
being counted for, and the image's own header decides the size — nothing is
guessed from a model's name:

```ts
const count = await Effect.runPromise(
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

A payload that is not text is the whole of what a rule priced, so a `file` part's
count is what a rule estimated it at, and its `mediaTokens` is the same number as
its `tokens`. Which rule priced it is not held: the estimation is a property of
the run that counted rather than of the trajectory.

A trajectory that carries the usage a provider reported — a `finish` part does —
holds the exact number, so prefer it over any estimate.

A list of parts is counted in one pass:

```ts
const counts = await Effect.runPromise(
  Effect.forEach(parts, Count.responsePart).pipe(Effect.provide(layer)),
);
```

## Producing the counts

A count is worth keeping: computing it again costs a pass over every part, and the
trajectory outlives the tokenizer that produced it. The package's `Metrics` module
declares the `@trajs/extension-tokenize/Estimate` metric, whose output is what one
part of a trajectory is worth — the count of that part, and what its session had
been worth up to it — so the counts travel with the trajectory and a reader that
installs the metric gets them back with their types. It is re-exported directly
from the package, because it is what the package is for: what it offers is the
metric and the producer a kit derives its data with.

```ts
import { Tokenizer, makeProducer, metrickit, tokenEstimate } from "@trajs/extension-tokenize";
import { Metric, MetricKit } from "@trajs/core";
import { Effect } from "effect";

// The tokenizer is the producer's own dependency, so it is provided around the
// producer rather than around the kit that runs it: the kit is built knowing
// nothing of it, and a part the tokenizer fails on is produced as the metric's
// own failure rather than failing the run.
const producer = await Effect.runPromise(
  makeProducer().pipe(Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" }))),
);

const runnable = MetricKit.toProducers(metrickit, {
  [tokenEstimate.tag]: producer,
});

// What the kit derived of a trajectory: one result per part it counted, each
// anchored to the part it was taken for by that part's uuid.
const estimates = Metric.produce(runnable)(trajectory);
```

`makeProducer(options)` builds the producer of the metric, and a kit runs it over
the parts of a trajectory. Everything else a trajectory needs belongs to the kit
rather than to the producer: `Metric.produce` reads the parts once however many
metrics the kit names, catches the failure a producer reported of a part and
produces it as the metric's own failure, and writing what was produced back as the
trajectory's own parts is a step of the kit as well.

Name kinds of message part with `tags` to count the parts that carry those kinds
alone — every part a tokenizer can count when it is omitted. The kinds are the
`type` of a message part that carries content: `text`, `reasoning`, `tool-call`,
`tool-result` and `file`. The kinds that carry meta information instead —
`tool-approval-request`, `tool-approval-response`, `source`, `response-metadata`
and `finish` — hold nothing a tokenizer answers for, so a count is not taken from
them. The count is the part's own whichever kinds selected it, because the kinds
decide which parts are counted rather than what a count covers.

Name a family with `media` to price a payload that is not text the way that
family's model does. Only a family this package names can be given, because a
trajectory does not state which rule priced a count; a rule of your own is
`Count`'s alone.

The tokenizer is the producer's own dependency, so `makeProducer` is not given
one: which tokenizer a trajectory is counted with is chosen where the producer is
provided with a layer, and travels with the producer rather than with the kit that
runs it.

Each result carries the datum of one part, `Estimate`, which is what the part is
worth and how it was derived:

- `count` is the count itself — a `Tokens.TokenCount`, the union of the shapes a
  count is stated as — so a reader branches on its tag to know what kind of part
  it was taken for and what that kind states. It is a field rather than the output
  itself because the data a metric's output states has to be a struct with a
  `version` of its own, and a union is not one.
- `total` is what the session of the part had been worth up to and including
  it, so a trajectory can be read for what it cost at any point of it without
  summing the parts before it. A part the producer did not count leaves it
  unchanged.

The datum says nothing about the part it is about beyond its `count`: the result's
`attach` names that part, so the datum does not repeat its content. Which tokenizer
took the count is not among them either: a tokenizer states no name, and which one
a run carries is a property of the run rather than of the trajectory. A count is an
estimate, not the usage a provider reported: a `finish` part holds the exact
whole-request figure, and that is where the exact number should be read from.

The shapes a count is stated as — `Tokens` — are not versioned, because only what
a trajectory holds is: `Estimate` is the newest shape of the metric's output,
`Uncounted` the failure of a part it could not count, and `tokenEstimate` the
metric that declares them, `0.1.0` being the only version stated so far. Adding a
version is deriving the output once with `VersionedSchema.upgrade` of `@trajs/core`
and stating it on the metric, with every earlier datum pinned to read forward as
it.

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
