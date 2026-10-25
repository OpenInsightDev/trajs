---
name: jsdocs
description: Use when writing, reviewing, or removing comments and public API documentation for @trajs. Covers wording, implementation comments, public JSDoc, sections, examples, `@category`, and `@stability`.
---

# Comments and JSDoc

## Workflow

1. Inspect the declaration, implementation, nearby JSDoc, tests, and call sites.
2. Select every applicable branch and load its reference before editing:
   - tags, modules, or links: [declarations.md](declarations.md);
   - categories: [categories.md](categories.md);
   - examples: [examples.md](examples.md);
   - comments inside code: [implementation.md](implementation.md).
3. Make a focused fix or module refinement. Preserve verified facts and valuable examples rather than rewriting mechanically.
4. For a module refinement or APIs with close alternatives, audit `@see` links and inspect implementation and tests for concrete **Gotchas**.
5. Run `vp check`. Run `vp test` when examples or code changed.

`@internal` declarations and modules are outside public JSDoc authoring.

## The three Cs

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
- Use backticks for identifiers, literal values, and expressions. Reserve `{@link}` for API symbols that help a reader navigate.
- Present tense and third person. No marketing or hedging words ("powerful", "simply", "just"), no first person, and no "this function" or "this module".
- Never restate the name, the signature, or the types.

## Public documentation

Public comments are the contract of the API, written for callers rather than maintainers. Every public module and export gets a JSDoc block.

The description is one paragraph. Optional non-empty sections appear once in this order: **When to use**, **Details**, **Gotchas**. Examples follow the sections, then the tags. A section earns its place only when it changes how a caller uses the API.

The weight of a public block lies in **When to use** and **Details**: state what cannot be inferred, `{@link}` to a sibling instead of repeating it, and let the type carry the rest.

The block shape, tag rules, and precedence live in [declarations.md](declarations.md).

## Implementation comments

Comments inside code explain why, not what. Load [implementation.md](implementation.md) for the marker rules, `SAFETY:` comments, and what to delete.
