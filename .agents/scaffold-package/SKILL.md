---
name: scaffold-package
description: Scaffold a new @trajs package in the trajs monorepo, or sync existing packages after a template or convention change. Use for "add a package", bootstrapping a Vite+ library package under packages/ or tools/, or bringing packages in line with this skill.
---

# Scaffold Package

Scaffold new `@trajs` packages, or sync existing ones, to the templates in `templates/` and the conventions below.

## Create a package

1. Create `packages/<name>/` with `src/` and `tests/`.
2. Render the templates (eta syntax: `<%= it.name %>`, `<%= it.description %>`) into the new package:
   - `templates/package.json.eta` → `package.json`, taking `homepage`, `license`, `author`, and `repository` from the top-level `package.json`
   - `templates/README.md` → `README.md`
   - `templates/tsconfig.json`, `templates/vite.config.ts` → copy verbatim (no placeholders)
3. Add `src/index.ts` and `tests/index.test.ts`.
4. Add dependencies; use `"catalog:"` for anything already in `pnpm-workspace.yaml`. Effect tests need `@effect/vitest` + `vitest` in `devDependencies`.
5. Run `vp install` at the repo root, then `vp check` and `vp test` in the package.

## Layout

Follow `packages/core` and `packages/eval`:

```
src/
├── index.ts      # barrel: export * as Foo from "./Foo.ts"
├── Foo.ts        # public module — top-level, PascalCase, one file = one namespace
└── internal/     # private logic — lowercase, never exported or published
tests/
└── Foo.test.ts
```

- Public modules are top-level and PascalCase (`Sandbox.ts`, `Trajectory.ts`), imported as namespaces (`import * as Foo from "./Foo.ts"`).
- Private helpers and runtime internals go in `src/internal/` with lowercase names (`fold.ts`, `sandbox.ts`); never re-export them from the barrel.
- Keep `src/index.ts` a hand-maintained barrel, one line per module.
- Always block internals with `"./internal/*": null` and `"./*/index": null` in `pack.exports.customExports`, whether or not `src/internal/` exists yet.

## Conventions

- Scope is always `@trajs/<name>`; ESM only.
- Package metadata (`homepage`, `license`, `author`, `repository`) defaults to the top-level `package.json` — never re-invent it or leave the template placeholders. A package may deliberately set its own value (e.g. an independent author); keep that value instead of overwriting it with the default.
- `imports` maps `#/*` to `./src/*`; imports use explicit `.ts` extensions.
- Tests live in `tests/*.test.ts`.
- Publish only `dist`, with `publishConfig.access: "public"`.
- Standard scripts: `build`, `dev`, `test`, `check`, `prepublishOnly`. Run them via `vp run`, never raw `node`/`vite`.
- Never hardcode versions that exist in the catalog.

## Sync existing packages

After changing any template or convention here, immediately audit every `packages/*` package (and `tools/*` when applicable) and update the divergent `package.json`, `tsconfig.json`, `vite.config.ts`, and `README.md`, ignoring package-specific values like `name`, `description`, and declared dependencies.
`homepage`, `license`, `author`, and `repository` default to the top-level `package.json`; never overwrite a value a package has intentionally set (e.g. an independent author) with that default.
If the new template conflicts with information a package already has, stop and ask the user before changing it.
Then run `vp install`, `vp check`, and `vp run -r test` across the affected packages.
Report intentional deviations (e.g. an extra `test` block in `vite.config.ts`) instead of skipping them silently.
