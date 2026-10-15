# Vendored anti-slop rules

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit
`c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`, taken from the `install-anti-slop`
skill's bundled copy of `src/`.

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
