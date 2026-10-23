<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Code Style

- Prefer `.pipe()` over function composition.

## Package Layout

- Keep a public module's private logic in the package's `src/internal/` (lowercase files, imported as `#/internal/*.ts`, never re-exported), and block `"./internal/*"` from the public surface.

## Comment Style

Short technical sentences, one per line, at most 20 words.

- `packages/core/src/Trajectory.ts` is the reference for this style. Match its comments.
- No relative clauses, no em dashes, no rhetorical colons. `SAFETY:` keeps its colon, the anti-slop linter requires it.
- Write only what the code and the types cannot say.
- Link every type a comment names with `{@link}`, and link the concrete type rather than its `Any` alias.
- Every public export has a JSDoc block with an `@category` tag.
- `**When to use**`, `**Details**` and `**Example**` sections are allowed. Never grow one for a small change.
- Section order is a description, `**When to use**`, `**Details**`, `**Example**`, then tags.
- A description opens with a verb for a function, and with a noun phrase for a value or type.
- An `**Example**` must run as written and end with `// =>` giving the result.
- `@see` contrasts a sibling export and says how the two differ.

Checklist when auditing a file:

- [ ] One sentence per line.
- [ ] No sentence over 20 words.
- [ ] No em dash, no rhetorical colon, no relative clause.
- [ ] Every type a comment names is linked with `{@link}`.
- [ ] Deleting a comment loses information the code does not carry.
- [ ] Every public export has a JSDoc block and a `@category`.
- [ ] No section grew for a small change.

## Command Execution

- DO NOT USE `timeout`.

## Testing

- Do not change the test suite unless the user explicitly asks for it.
- Temporary unit tests written while implementing are allowed, but delete every one of them once the task is done.
