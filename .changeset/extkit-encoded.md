---
"@trajs/core": minor
---

Add `Extensionkit.encode`, which serializes an extension kit the way `Toolkit.encode`
serializes a toolkit: each extension contributes the draft-07 JSON Schema document
of its line of versions and its descriptive name and description, keyed by its
identifier, so the data formats a recording
carries can be stored or described without the Effect Schemas the lines were built
from. The document describes the whole line, so data recorded against an older
version is described too.

`Persist.encode` writes that kit into the `.trajs` header as its `extkit` field,
next to the serialized `toolkit`. Like the toolkit, the header's kit is accepted
but not held by the decoded trajectory, so extension parts are read unconstrained
until they are bound with `Extensionkit.extkits`.
