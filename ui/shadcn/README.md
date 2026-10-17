# @trajs/shadcn

The shadcn/ui components the trajs front end renders with — the `base-nova`
preset over [Base UI](https://base-ui.com) primitives, copied in as source by
the `shadcn` CLI rather than installed — together with the design language they
are styled with, shipped as [`styles.css`](#the-theme).

They live in their own package because two things need the same components —
the viewer app, and [`@trajs/component`](../component), the component library
that maps `effect/ai`'s prompt model onto them — and a component copied twice is
a component that drifts. Each is a workspace dep of whatever renders it, so a
consumer swaps the whole set by aliasing `@trajs/shadcn`, and no component's look
is decided inside `@trajs/component`.

## The components

They are copied sources, not project code: the repository's formatter and linter
skip them, and they are re-added with `shadcn add` rather than edited, so that
re-running the CLI stays a no-op. They import each other through this package's
own import map — `#components/bubble` — which is what makes them relocatable;
`vp pack` rewrites those to relative paths in `dist/`.

## Import paths

A consumer imports a component from the package root — `@trajs/shadcn/badge`
— which is the `./*` export. The `./components/*` export resolves to the same
files and exists only for the `shadcn` CLI: `shadcn add` resolves the `ui` alias
(`@trajs/shadcn/components`) by matching a wildcard export key, so the
subpath it names has to exist. `./*` alone leaves the CLI no subpath to match,
and a bare package alias does not resolve.

## The theme

Every component is styled with shadcn's semantic tokens — `--background`,
`--foreground`, `--muted`, `--primary`, `--destructive`, `--border`, `--ring`,
`--radius` — and none of them are defined inside a component. They come from
`styles.css`, exported as `@trajs/shadcn/styles.css`: the trajs design
language — the light and dark values, the `@theme inline` mapping that turns them
into Tailwind utilities, and the base layer that applies them.

```css
@import "tailwindcss";
@import "@trajs/shadcn/styles.css";
```

It sits at the package root, not under `src/`, so it is project code: the
formatter and linter keep it, and `shadcn add` never touches it. An app that
brings its own shadcn tokens can skip the import and the components read those
instead.

## Adding a component

Add it from the app that needs it, so the CLI routes the files and the imports
across the workspace boundary:

```bash
cd ui/viewer
pnpm dlx shadcn@latest add <component>
```

From this directory, the same command writes against the local aliases in
`components.json`.

## Building

```bash
vp pack   # into dist/, with types
vp dev    # vp pack --watch
```
