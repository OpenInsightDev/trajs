# @trajs/ui

The shadcn/ui components the trajs front end renders with: the `base-nova`
preset over [Base UI](https://base-ui.com) primitives, copied in as source by
the `shadcn` CLI rather than installed.

They live in their own package because two things need the same components —
the viewer app, and [`@trajs/react`](../react), which maps `effect/ai`'s prompt
model onto them — and a component copied twice is a component that drifts. Each
is a workspace dep of whatever renders it, so a consumer swaps the whole set by
aliasing `@trajs/ui`, and no component's look is decided inside `@trajs/react`.

## The components

They are copied sources, not project code: the repository's formatter and linter
skip them, and they are re-added with `shadcn add` rather than edited, so that
re-running the CLI stays a no-op. They import each other through this package's
own import map — `#components/bubble` — which is what makes them relocatable;
`vp pack` rewrites those to relative paths in `dist/`.

## The token contract

Every component is styled with shadcn's semantic tokens — `--background`,
`--foreground`, `--muted`, `--primary`, `--destructive`, `--border`, `--ring`,
`--radius` — and none of them are defined here: the consuming app owns its theme
and its `@theme inline` mapping, the way it does with shadcn/ui installed
locally. An app that already has shadcn's tokens needs nothing more.

## Adding a component

Add it from the app that needs it, so the CLI routes the files and the imports
across the workspace boundary:

```bash
cd apps/viewer
pnpm dlx shadcn@latest add <component>
```

From this directory, the same command writes against the local aliases in
`components.json`.

## Building

```bash
vp pack   # into dist/, with types
vp dev    # vp pack --watch
```
