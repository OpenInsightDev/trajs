# Tags, Modules, And Links

## Declaration shape

Use a multiline JSDoc block for a public declaration:

````ts
/**
 * Short description as one paragraph.
 *
 * **When to use**
 *
 * Optional practical usage guidance.
 *
 * **Details**
 *
 * Optional details for complex behavior.
 *
 * **Gotchas**
 *
 * Optional concrete caveats.
 *
 * **Example** (Parsing JSON)
 *
 * ```ts import.meta.vitest
 * operation() // => expected
 * ```
 *
 * @see {@link sibling} for the variant that ...
 * @stability stable
 * @category constructors
 */
````

Write practical English about the public concept, not its implementation. Start functions and methods with a present-tense action such as `Creates`, `Returns`, or `Converts`; match nearby noun families for values, such as `Schema for`, `Layer that`, or `Service that`.

Document a dual or overloaded export with one block above the declaration, not one block per signature.

The description is one paragraph. Optional non-empty sections appear once in this order: `**When to use**`, `**Details**`, `**Gotchas**`. Examples follow the sections. Separate descriptions, sections, examples, and tags with exactly one blank line. Use prose for one fact and bullets for parallel facts. Do not add other headings.

`**When to use**` states a positive use case distinct from the description and begins with `Use to`, `Use when`, `Use as`, or `Use with`. Put sibling comparisons in `@see`. Reserve `**Gotchas**` for concrete preconditions, edge cases, surprising behavior, and important failure modes.

## Tags

Declaration tags appear in this order:

1. `@deprecated`
2. `@default`
3. `@see`
4. `@stability`
5. `@category`

- Roots require `@stability` and `@category`; they take no `@default`.
- Namespaces permit `@category` and reject `@default`.
- Member JSDoc is optional. When present it permits `@default`, rejects `@category`, and follows the prose contract. A member's `@default` states the value used when the caller omits it, written as code: `@default "first"`. Omit it when the type already states the default.
- Any declaration permits one non-empty `@deprecated` and repeated non-empty `@see` tags. Every other tag appears at most once.
- Every public export of a core library under `packages/` requires `@stability`. Use `stable` or `experimental`.
  - `stable` breaks only on a major of the whole core group.
  - `experimental` may break on a minor.
  - `@deprecated` is a separate tag. Removing a deprecated export that was `stable` is still a major.
- This repository does not use `@since`. The shared core version describes no single API; `@stability` is the contract.
- `@deprecated` names the replacement: `@deprecated Use {@link successors} for outgoing neighbors.`
- `@internal` declarations take no public JSDoc block.

Use canonical `**Example**` sections rather than `@example` tags or loose code fences.

## Modules and links

Put the module JSDoc first, before imports. A block attached to the first non-import declaration documents that declaration, not the module. An `@internal` module is omitted.

Module prose does not use the declaration template. It is one or two short paragraphs on the domain the module covers and what it provides, naming notable entry points with `{@link}`. Its tags are optional non-empty `@deprecated`, repeated non-empty `@see`, then `@stability`. It carries no `@category`. Separate the prose from the tags with one blank line.

Inline `{@link Symbol}` targets must resolve to TypeScript symbols; use normal Markdown links for URLs. Prefer code formatting when navigation does not help a reader understand or choose the API.

Use `@see` only for a verified related public API: a close alternative, inverse, complement, level variant, or closely returned, consumed, or configured type. Explain non-obvious relationships with `for ...`. Exclude implementation dependencies, broad concepts, example-only helpers, private APIs, and merely lexical matches. The target must have public JSDoc.
