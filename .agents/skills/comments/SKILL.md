---
name: comments
description: Use when writing, reviewing, or removing comments and public API documentation. Covers wording, implementation comments, and public JSDoc, including `@category` and `@stability`.
---

# Comment Rules

## The three Cs of writing

Applies to every comment and doc block below: write so a reader gets the point in one pass.

- **Clear**: Use active voice and unambiguous pronouns. One idea per sentence, in short sentences, and define a term before relying on it.
- **Concise**: Say only as much as the reader needs. Excess detail makes the text tedious and unread; cut anything the code or types already say.
- **Consistent**: Use the same wording for the same concept throughout a file and across the project.

## Wording

Applies to implementation comments and to public JSDoc.

- Short technical sentences, one per line, at most 20 words. `packages/core/src/Trajectory.ts` is the reference. Match its comments.
- No relative clauses, no em dashes, no rhetorical colons. `SAFETY:` keeps its colon. The anti-slop linter requires it.
- Write only what the code and the types cannot say.
- Use terminology already established in the project or Effect. Verify usage against existing APIs, documentation, and implementation.
- Name concrete APIs and concepts directly. Do not invent umbrella terms or replace established names with vague synonyms.
- Link every type a comment names with `{@link}`, and link the concrete type rather than its `Any` alias.

## Implementation comments

Implementation comments are the comments inside function bodies and on non-exported code. The JSDoc on public modules and exports is documentation, not implementation commentary: never delete or trim it here, and follow the rules below when writing it.

- **No filler**: Do not repeat the file name, module path, or doc paths in comments (e.g. no `//! This module defines the... described in ...`).
- **Do not explain "what"**: Structures, names, and module relationships that the code already makes self-evident need no extra comments.
- **Only explain "why"**: Write brief comments only when the implementation is genuinely complex, relies on a special business trick, or is counter-intuitive, and explain the reason.
- **Stay self-consistent**: Assume the reader has already read related docs; do not restate or hyperlink their content in code.

## Public documentation

Public comments are the contract of the API, written for callers rather than for maintainers. Use the Effect style: a JSDoc block on every public module and export, in present tense and third person, plain and declarative. No marketing or hedging words ("powerful", "simply", "just"), no first person, and no restating the name, the signature, or the types.

The blocks appear in this order. A section is optional when it does not earn its place. Never add `**When to use**`, `**Details**`, or `**Example**` for a small change.

- **Description** — one sentence saying what the export is or does at the caller's level. A noun phrase for values and types ("A message accepted by a chat completions endpoint."), a verb phrase for functions ("Transforms each element using a function.").
- **`**When to use**`** — the caller's situation: the intent or problem that makes this API the right choice, phrased "Use when …" or "Use to …". This is the decision, not the mechanics, and it earns its place whenever a sibling API could be mistaken for this one.
- **`**Details**`** — the semantics that a name and a type cannot carry: invariants, edge cases, ordering, defaults, laziness and lifetime, error conditions, what is dropped or ignored, and how it interacts with other modules. This is where public "why" belongs. Be factual and specific, and use a `-` list for several independent points. Do not let it become a dumping ground: keep only what changes how a caller uses the API, and leave internals and maintainer-facing notes out.
- **`**Example**`** — a title in parentheses and a fenced `ts import.meta.vitest` block that imports what it uses, builds the smallest realistic input, and ends with the actual result as a `// =>` comment. The example is part of the contract: it should show the behavior described above, not just the happy-path call.
- **`@see`** — link the related and, above all, contrasting exports, each with a short trailing label: `@see {@link dedupeWith} — use custom equality`.
- **`@category`** — required on every public export. A lowercase noun phrase classifying the export ("constructors", "mapping", "models"), kept consistent across the module.
- **`@stability`** — on every public export of a core library under `packages/`. One of `stable`, `experimental`, or `deprecated`, placed next to `@category`. `stable` breaks only on a major of the whole core group. `experimental` may break on a minor. `deprecated` will be removed, and removing one that was `stable` is still a major.

Module docs sit at the top of the file: one or two sentences on the domain the module covers and what it provides, naming notable entry points with `{@link}`. They carry no `@category`. Separate the prose from the `@see` and `@category` tags with a blank line.

The weight of a public block lies in `**When to use**` and `**Details**`: state what cannot be inferred, `{@link}` to a sibling instead of repeating it, and let the type carry the rest.
