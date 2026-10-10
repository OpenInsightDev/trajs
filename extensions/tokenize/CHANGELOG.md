# @trajs/extension-tokenize

## 0.1.0

### Minor Changes

- [`b638ad7`](https://github.com/OpenInsightDev/trajs/commit/b638ad705c411639447224a6d6d45b08a0468df7) Thanks [@observerw](https://github.com/observerw)! - Add the `Extension` module, which records what a trajectory part is worth as the
  `org.js.tra.tokenize` extension (data versions `0.1.0` and `0.1.1`). The package
  entry re-exports it directly, so its exports — the datum and the constructors
  below, and the extension itself as `extension`, `extensions` and `registry` — are
  the package's own.
  
  `of` estimates one part and returns the extension part carrying the count,
  anchored to the counted part's `uuid`; `annotate` emits one such part directly
  after every part whose messages carry a message part of a kind `tags` names — every
  part a tokenizer can count when it is omitted — and carries the toolkit, the
  metadata and the extension kit over, its kit extended with the extension. Both
  count a part by the same walk `Count` counts it with, and fail on a text holding a
  special token the tokenizer does not allow.
  
  The kinds are the message-part kinds that carry content — `text`, `reasoning`,
  `tool-call`, `tool-result` and `file` — so a recording can be annotated for the
  parts that carry what a caller cares about, such as the ones that carry an image.
  The kinds that carry meta information instead, such as a response's `finish` or
  `source`, hold nothing a tokenizer answers for and are not tags. The count is the
  part's own whichever kinds selected it: naming kinds decides which parts are
  annotated rather than what a count covers.
  
  The datum states only what the part cannot: `tokens`, the estimated count of the
  whole part, `encoding`, the encoding it was taken under, `media`, the family that
  priced a payload that is not text, and `mediaTokens`, how many of `tokens` such a
  rule priced. It deliberately says nothing about the part it is about, which the
  extension part's `attach` already names, and the count is an estimate rather than
  the usage a provider reported, which stays in the `finish` part of a response.
  
  The shape is a line of versions, each version declared by deriving the one before
  it: `0.1.0` is written out, and `0.1.1` derives from it with `Extension.upgrade`
  from `@trajs/core` to add `mediaTokens`. A datum recorded at `0.1.0` reads as
  `0.1.1` without it, because the number is not in the older datum and cannot be
  recovered from it; the field is optional rather than defaulted, so absence means
  the datum predates it rather than that nothing was priced by a rule.
  
  `registry` holds the extension as of each data version the package defines, keyed
  by the version literal and by `latest` for the newest, so a recording can be read
  or written at a version other than the newest one: each entry reads the versions up
  to it and writes the one it is keyed by. `extension` is the newest version alone,
  `extensions` is its kit, and `Estimate` is the newest version's shape, read off the
  line rather than written again, so deriving a version moves it while a datum
  recorded at an older version still reads as the newer one.

- [`74b2b55`](https://github.com/OpenInsightDev/trajs/commit/74b2b557499956bc31ebcdfe4af9651f1bbfd877) Thanks [@observerw](https://github.com/observerw)! - Add `@trajs/extension-tokenize`, a byte-pair tokenizer built on Effect.
  
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

### Patch Changes

- Updated dependencies [[`c2f3442`](https://github.com/OpenInsightDev/trajs/commit/c2f344248f219f33111314ba65c67d9ce9e2062a), [`ada5c9a`](https://github.com/OpenInsightDev/trajs/commit/ada5c9aebe0871cf8251b64d5bfe25ebe680aa28), [`b478d8f`](https://github.com/OpenInsightDev/trajs/commit/b478d8f5086cfc0b3c75e82e6e14e28d26d2108a), [`9b59157`](https://github.com/OpenInsightDev/trajs/commit/9b59157449827c40990a15ad44dcaba9f58001e6), [`3e3bf0e`](https://github.com/OpenInsightDev/trajs/commit/3e3bf0ef984b6e27f71c9782369dd7c203342446), [`770e141`](https://github.com/OpenInsightDev/trajs/commit/770e141e4772ad0efc34325fdd5bf89f93c65c20), [`6d94f2f`](https://github.com/OpenInsightDev/trajs/commit/6d94f2f02dea8cce71f1d1dcd805403b4e6fa36e), [`2ae404a`](https://github.com/OpenInsightDev/trajs/commit/2ae404af9309a3d06e9d47eecdc0097287d1d200), [`f7a4412`](https://github.com/OpenInsightDev/trajs/commit/f7a441228eb341df8f867f293c904319bba36e09), [`41489e3`](https://github.com/OpenInsightDev/trajs/commit/41489e3dfa8b3484a877a92cfdd08957bb2e6f51), [`7d7d0b7`](https://github.com/OpenInsightDev/trajs/commit/7d7d0b7d97d8978b7d200855ef113840a907bef5), [`0da2ad8`](https://github.com/OpenInsightDev/trajs/commit/0da2ad8c4172e03d5461a2f07cd1b030b3e983e1), [`0f6cb44`](https://github.com/OpenInsightDev/trajs/commit/0f6cb44ff1c6a5eacb33611a3634fcaa2eaf1acb), [`9a8548a`](https://github.com/OpenInsightDev/trajs/commit/9a8548ad4eeac51f3c70df8142d41956b4f5219b), [`aed956c`](https://github.com/OpenInsightDev/trajs/commit/aed956c8eea2587740b376d3c4e7e6f30085b152), [`a2640d7`](https://github.com/OpenInsightDev/trajs/commit/a2640d71a81f00c30dd5da85396fbdae0aa996de), [`e913c0a`](https://github.com/OpenInsightDev/trajs/commit/e913c0ab92e590e5da126b434daadd4cb33633e2), [`4515f85`](https://github.com/OpenInsightDev/trajs/commit/4515f85fa9603a3104fafb2ecad83f037ab16748), [`2edd6a0`](https://github.com/OpenInsightDev/trajs/commit/2edd6a05e1e00b6122cee93332f9c7183a1d3353), [`798a3bd`](https://github.com/OpenInsightDev/trajs/commit/798a3bd8017986233a2c97369659b0eac0710161), [`4a8d1a9`](https://github.com/OpenInsightDev/trajs/commit/4a8d1a99b0c61e810f6a8adfdbb16275ecdc6a5f)]:
  - @trajs/core@0.1.0
