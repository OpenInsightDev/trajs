# Implementation Comments

Implementation comments are the comments inside function bodies and on non-exported code. The JSDoc on public modules and exports is documentation, not implementation commentary: never delete or trim it here, and follow the public rules when writing it.

- **No filler**: Do not repeat the file name, module path, or doc paths in comments, such as `//! This module defines the ... described in ...`. Delete a comment that restates the code or explains what the next line does.
- **Do not explain "what"**: Structures, names, and module relationships that the code already makes self-evident need no extra comments.
- **Only explain "why"**: Write a brief comment only when the implementation is genuinely complex, relies on a special business trick, or is counter-intuitive, and explain the reason.
- **Stay self-consistent**: Assume the reader has already read the related docs; do not restate or hyperlink their content in code.

A comment above a statement belongs to that statement. Keep it next to the code it explains.

## SAFETY comments

The anti-slop linter requires a `SAFETY:` comment for every non-const type assertion. The comment states the checked invariant TypeScript cannot express, immediately before the assertion or its containing statement.

```ts
// SAFETY: every entry is the data of one tag the kit declares for this part,
// which is what the record holds.
return Object.fromEntries(declared) as ExtraRecord<K["extra"], P>;
```

Do not write `SAFETY: unsafe cast` or restate the assertion. If the invariant cannot be stated, remove the assertion instead.

## Markers and stale comments

- `TODO:` names the missing work and when it can be removed. Delete the comment when the work is done.
- `HACK:` states the constraint that forces the workaround and what would remove it.
- Delete or update a comment when the behavior it explains changes. A stale comment is worse than none.

`@internal` declarations and non-exported declarations use the prose rules above. They do not take public tags such as `@category`, `@stability`, or `@see`.
