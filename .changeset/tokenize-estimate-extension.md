---
"@trajs/extension-tokenize": minor
---

Add the `Extension` module, which records what a trajectory part is worth as the
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
