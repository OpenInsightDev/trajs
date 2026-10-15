---
name: clear-comments
description: Use when user asks to clear the comments in the project, or to write or review public API documentation. Covers implementation comments and public JSDoc.
---

# Comment Rules

## Implementation comments

Implementation comments are the comments inside function bodies and on non-exported code. The JSDoc on public modules and exports is documentation, not implementation commentary: never delete or trim it here, and follow the rules below when writing it.

- **No filler**: Do not repeat the file name, module path, or doc paths in comments (e.g. no `//! This module defines the... described in ...`).
- **Do not explain "what"**: Structures, names, and module relationships that the code already makes self-evident need no extra comments.
- **Only explain "why"**: Write brief comments only when the implementation is genuinely complex, relies on a special business trick, or is counter-intuitive, and explain the reason.
- **Stay self-consistent**: Assume the reader has already read related docs; do not restate or hyperlink their content in code.

## Public documentation

Public comments are the contract of the API, written for callers rather than for maintainers. Use the Effect style: a JSDoc block on every public module and export, in present tense and third person, plain and declarative. No marketing or hedging words ("powerful", "simply", "just"), no first person, and no restating the name, the signature, or the types.

The blocks appear in this order, and each is optional when it does not earn its place:

- **Description** — one sentence saying what the export is or does at the caller's level. A noun phrase for values and types ("A message accepted by a chat completions endpoint."), a verb phrase for functions ("Transforms each element using a function.").
- **`**When to use**`** — the caller's situation: the intent or problem that makes this API the right choice, phrased "Use when …" or "Use to …". This is the decision, not the mechanics, and it earns its place whenever a sibling API could be mistaken for this one.
- **`**Details**`** — the semantics that a name and a type cannot carry: invariants, edge cases, ordering, defaults, laziness and lifetime, error conditions, what is dropped or ignored, and how it interacts with other modules. This is where public "why" belongs. Be factual and specific, and use a `-` list for several independent points. Do not let it become a dumping ground: keep only what changes how a caller uses the API, and leave internals and maintainer-facing notes out.
- **`**Example**`** — a title in parentheses and a fenced `ts import.meta.vitest` block that imports what it uses, builds the smallest realistic input, and ends with the actual result as a `// =>` comment. The example is part of the contract: it should show the behavior described above, not just the happy-path call.
- **`@see`** — link the related and, above all, contrasting exports, each with a short trailing label: `@see {@link dedupeWith} — use custom equality`.
- **`@category`** — a lowercase noun phrase classifying the export ("constructors", "mapping", "models"), kept consistent across the module.

Module docs sit at the top of the file: one or two sentences on the domain the module covers and what it provides, naming notable entry points with `{@link}`. They carry no `@category`. Separate the prose from the `@see` and `@category` tags with a blank line.

The weight of a public block lies in `**When to use**` and `**Details**`: state what cannot be inferred, `{@link}` to a sibling instead of repeating it, and let the type carry the rest.
