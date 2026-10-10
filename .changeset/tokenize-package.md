---
"@trajs/extension-tokenize": minor
---

Add `@trajs/extension-tokenize`, a byte-pair tokenizer built on Effect.

`Tokenizer.layer("o200k_base")` builds a tokenizer from one of the encodings the
package ships — `cl100k_base`, `o200k_base`, `p50k_base` and `claude`, listed as
`Tokenizer.encodingNames`. Each is kept as the rank source its model publishes,
so it is read when a tokenizer is built from it and never when the package is
imported, and a read encoding is reused. `Tokenizer.layerFromEncoding` builds one
from any other encoding, whose generated storage is declared by `Encoding` as a
schema and validated where it enters a program.

Either way, `encode`, `decode` and `count` are offered as a `Context.Service`,
byte-pair merges are memoized in a bounded Effect `Cache` that evicts the oldest
merge first, and a text holding a special token the call does not allow fails with
`DisallowedSpecialToken` instead of being encoded as ordinary text.

`Count.promptPart` and `Count.responsePart` estimate the tokens a recorded
`Trajectory.PromptPart` or `Trajectory.ResponsePart` is worth under a tokenizer,
with the rules `ai-tokenizer` estimates an AI SDK message with: text and
reasoning as their text, a tool call as its name and the JSON of its parameters,
a tool result as its identifier and its result, and an image or a file as a fixed
estimate, and `CountOptions.media` replaces the estimate of a payload that is not
text with the rule of the family being counted for: `"openai"` charges a base
plus a 512px tile each and `"anthropic"` a token per 750 pixels, both reading the
image's size out of its own PNG, JPEG, GIF or WebP header, while the 85 and 100
tokens `ai-tokenizer` uses stay the placeholder for anything a rule cannot size.
No rule is ever guessed from a model's name: the caller names the family, calls
`Count.openAiRule` with another generation's numbers, or passes a rule of its own.
The overhead a model adds around the parts — a base cost per request, a cost per
message or per tool, and a content multiplier — is not included either, because
trajs records no such configuration.
