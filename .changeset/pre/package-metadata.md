---
"@trajs/core": minor
---

`PackageMetadata` states what a package says of itself in its `package.json`: the
`version`, `description`, `keywords`, `homepage`, `license`, `author` and
`repository` that identify the package and the repository it lives in. The other
fields of the file are left out, the package's `name` among them, since a
declaration already states it. `author` and `repository` accept the string form a
`package.json` permits.

An event, a metric, and an extra declaration accept that as their optional
`packageMetadata`, beside the metadata each already states of itself, so what a
trajectory states of a declaration names the release and the repository of the
package that declared its data. A stored header records both for event, metric,
and extra entries.

The `package` field of an event, a metric, and an extra declaration is now
`packageName`, since the package's own metadata sits beside it. `tag` still joins
it with `id`.

A declaration is written in the package whose `package.json` it states, so the
fields are attached from that file rather than restated:
`@trajs/extension-tokenize` states `packageMetadata: pkg` of the `package.json` it
imports. `packageName` is written out as a literal rather than as `pkg.name`, so
the tag keeps its literal type.
