# Vendored anti-slop rules

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit
`13909c9e07590f5a85d93c62712259fe14a883f7`, taken from the `install-anti-slop`
skill's bundled copy of `src/`. The list below records every revision copied;
the newest is the one above.

Copied to `tools/oxlint/anti-slop/` by that skill's `scripts/install.mjs` and
kept unmodified. Only `index.ts` and `effect/index.ts` are registered, in
`vite.config.ts`, as the `anti-slop` and `anti-slop-effect` plugins.

`@oxlint/plugins` and `oxlint` are pinned to `1.85.0` to match the Oxlint that
Vite+ bundles.

The nested `vendor/eslint-stylistic/` keeps its upstream `LICENSE` and
`UPSTREAM.md`; readability enforcement is self-contained and needs no Stylistic
runtime dependency.

## Updating

Follow the skill's update procedure: stage an explicit upstream revision, merge
against the pristine snapshot, and preserve local rule and configuration
choices. This record identifies the revision actually copied.

## Update history

### `c44ef22` — initial copy

The tree was first copied at commit
`c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`, before any of its own history.

### `13909c9` — current

The tree above was updated to commit
`13909c9e07590f5a85d93c62712259fe14a883f7` (the `feat: keep consecutive
single-line bindings grouped in require-readable-spacing` merge), staged with
that revision's own `install-anti-slop` skill bundle.

Base: `c44ef22`, which is an ancestor of `13909c9` in upstream history, so the
three-way merge had a recoverable base. The local tree was byte-identical to the
base, so there were no local deviations to preserve and the update is a straight
apply of the three files upstream changed under `src/`.

Adopted:

- `rules/require-readable-spacing.ts` — groups consecutive single-line bindings
  at any scope, including module scope, and starts a new group at a binding that
  carries its own leading comment.
- `vendor/eslint-stylistic/padding-line-between-statements.ts` —
  `createPaddingLineRule(options, statementTypes?)` accepts caller-defined
  statement types, looked up before the built-in table. That is what lets the
  policy above recognize exported and single-line bindings without editing the
  vendored matchers.
- `vendor/eslint-stylistic/UPSTREAM.md` — the adaptation record for that second
  argument.

Unchanged: the rule set and both plugin entry points, so `vite.config.ts` needs
no edit, and no new `oxlint`/`@oxlint/plugins` version is required — the pair
stays at `1.85.0`. Upstream's `README.md` prose is not vendored.

Deferred: nothing. Upstream changed no other vendored file between the two
revisions. The whole installation now matches `13909c9`, and this revision is
the base for the next update.

## Local additions

Two rules are written here rather than copied from upstream, and upstream has no
equivalent for either. A future update must keep both rule files, their imports
and entries in `effect/index.ts`, their `warn` severity in `vite.config.ts`, and
the `effect/scripts/list-data-last-apis.mjs` generator below, instead of reading
them as drift to erase; the installer overwrites `effect/index.ts` but deletes
nothing, so re-apply the registrations by hand after a sync.

### `prefer-pipe-over-nesting`

`effect/rules/prefer-pipe-over-nesting.ts` reports a call whose first argument
is a call and which is the third call deep or more — `a(b(c(...)))` — and offers
a staged `.pipe(...)` rewrite as an editor suggestion. Arguments after the nested
call do not end the chain; the reminder then names the step as the curried call
that carries them. A `.pipe(...)` application ends a chain instead of extending
it, since a pipeline is what the rule asks for.

It is registered at `warn`, not `error`: a value outside Effect's data types
has no `.pipe(...)` of its own, and `vite.config.ts` is what runs `vp check
--fix` over staged files, so the rewrite stays a suggestion that `--fix` will
not apply on its own.

### `prefer-pipe-for-data-last-apis`

`effect/rules/prefer-pipe-for-data-last-apis.ts` reports a call that hands a value
to one of Effect's data-last APIs on the computation data types —
`Effect.runPromise(program)`, `Stream.runCollect(stream)`, `Effect.scoped(program)`,
`Layer.build(layer)` and the rest of the table — and offers
`program.pipe(Effect.runPromise)` as a suggestion. Nesting depth is irrelevant:
wherever the call appears, the value should have been in front of it.

The table is generated, not guessed: `effect/scripts/list-data-last-apis.mjs`
prints it from the installed declarations, and the committed table is that output
byte for byte. An API is listed when it has exactly one call signature, so no
`dual` data-first form, and exactly one required parameter of its module's own
type. Re-run the script after an Effect upgrade and paste its output over the
table.

That test is also what keeps out the APIs the rule must not touch: `dual` APIs
(`Effect.map`, `Effect.provide`, `Stream.map`) have a data-first call form of their
own, `suspend` takes a thunk (`LazyArg<…>`) rather than a program, and
constructors over plain values (`Effect.succeed`, `Stream.fromEffect`) take no
program at all.

The table stops at the computation data types — `Effect`, `Stream`, `Channel`,
`Sink`, `Layer`. The same criterion reaches about 400 more names across some 70
modules: the data structures, refs, queues and semaphores. Those are left out
because their call form is a read or a test on a value rather than a stage of a
program, and the repo writes them that way — `Option.isSome(turn)` inside a
ternary, `Option.isNone(open)` inside a condition — with 12 such call forms
(`Option.isSome`/`isNone`, `Exit.isSuccess`, `Result.isSuccess`,
`Cause.hasInterruptsOnly`, `DateTime.formatIso`, `Fiber.join`) that a wider table
would turn into pipelines. Add the modules to the script's `MODULES` to rule on
that.

A call is reported only when the value is its only argument:
`Effect.runPromise(program, options)` has no `.pipe(...)` spelling, so it stays a
call. The suggestion is withheld unless the rewrite is provably faithful: no type
arguments or optional chain, an argument `.pipe(...)` can be appended to (`a ? b : c`,
`x as T` and an arrow function body would bind wrongly), and no comment between the
call's parentheses and the value, which the rewrite would drop.

It is registered at `warn` like the rule above. Nine call forms became stages when
it landed — `Stream.runCollect` in `packages/core/src/internal/view.ts`,
`ui/viewer/src/lib/trajectory.ts` and two test files, `Effect.runPromise` in three
— so it reports nothing today, and `error` would pass.

Both rules are verified the same way: by driving the native Oxlint CLI against
this entry point — the shapes they report, the shapes they leave quiet, the
suggested rewrites, and that a second pass is stable. The generated table is
verified by diffing the script's output against the table in the rule. Nothing
here tests them in-repo; `effect/rules/*.test.ts` in upstream is where RuleTester
cases belong when they move there.
