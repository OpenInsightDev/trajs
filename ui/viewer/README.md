# viewer

The trajs trajectory viewer, built with [Vite](https://vite.dev) and React. It
reads a `.trajs` file and shows the sessions it holds as the conversations they
were, and it is also where the components that do that are read at: the app is
two pages — the viewer, and `src/components/gallery.tsx`, which renders every
prompt and response part, so the whole mapping can be read off it.

Run it from the repository root with `vp run viewer`, or from this directory:

```bash
vp dev         # Vite dev server
vp build       # production bundle into dist/
vp preview     # preview the built bundle
vp run sample  # write public/sample.trajs, the trajectory the viewer opens on
```

Unlike the docs site, the viewer is a plain Vite app, so Vite+'s built-in
`vp dev`, `vp build` and `vp preview` are the commands it uses directly. The
`dev`, `build` and `preview` package scripts run those same built-ins so the
root tasks and `vp run -r build` reach it, and `sample` is a package script like
any other, so it is run through `vp run`.

## Reading a trajectory

The viewer opens on `public/sample.trajs`, written by `scripts/sample.ts` —
producing a trajectory of a real model session takes a model, an API key and a
network, and the viewer is opened without any of them — and reads any other
trajectory from a
file picked from disk or dropped on the page. A trajectory is read in the page
rather than by a server: the app is the whole of what it needs, and nothing of a
trajectory goes anywhere.

What is read is [`@trajs/core`](../../packages/core)'s exchange, over the
compression that runs in a page: its parts are carried in a frame the platform
package states, and [`@trajs/platform-browser`](../../packages/platform-browser)
is the one over a WebAssembly codec — where `@trajs/platform-node` is over
`node:zlib`. The viewer provides the WebAssembly layer from
`src/lib/trajectory.ts`, so a page reads a trajectory with no server and no
`node:zlib`.

What is shown is the sessions the trajectory declares, which is what
`src/lib/trajectory.ts` reads it into:

- every session the trajectory declares as a root, and every session forked off
  one nested under the session that produced the part it continues from, in
  `src/components/viewer/session-tree.tsx`;
- the conversation of the selected one, in
  `src/components/viewer/conversation.tsx`: the turns it produced for itself,
  read below the turns it inherited from the sessions it continues from — each
  stretch named by the session that produced it, and the one a session continues
  from named where its own turns begin.

A fork holds none of the parts of the session it continues from, so what a
forked session shows of that session is read from the session itself, up to and
including that part. A trajectory that holds several roots is one trajectory, not
one conversation, and the tree is where that reads.

The page carries what a reader came for and little else: a session is named over
a conversation only where that conversation reads more than one of them, the part
a fork was made at is on request rather than on the page, and what a session
holds is what opening it shows.

## What the gallery renders

The mapping from `effect/ai`'s prompt model to shadcn/ui lives in
[`@trajs/component`](../component), and the shadcn/ui components it renders
with live in [`@trajs/shadcn`](../shadcn). Both are workspace packages,
and
the app depends on them rather than owning either: a component that is copied
into an app is a component the next app copies again.

The gallery is reached at `#/components` and is the mapping's own showcase
rather than a viewer of a trajectory's data: the prompts it renders are written in it
with `effect/ai`'s own constructors, so it needs no trajectory, no model and no
network. Each section names the part it shows and the component that part is
mapped to.

## The theme

The design language is `@trajs/shadcn/styles.css`, the stylesheet
`@trajs/shadcn` ships: the semantic tokens — `--background`, `--foreground`,
`--muted`, `--radius` and the rest — the `@theme inline` mapping that turns them
into Tailwind utilities, and the base layer that applies them. Both packages are
styled with those tokens and define none of them, the way shadcn/ui does not: the
theme owns the values, the components read them.

`src/index.css` is only this app's wiring — what differs per app:

- it imports Tailwind, shadcn's own Tailwind layer, the Geist webfont, the
  component package's stylesheet, and `@trajs/component/styles.css`.
- it carries the `@source` lines Tailwind needs to see the utility classes in the
  two packages and in Streamdown, none of which it scans on its own. They point
  at the packages' sources, which is what they resolve to here; an app
  installing them from npm points at their `dist` directories instead. Streamdown
  is read here rather than imported, which is why the app depends on it and on
  its code plugin: drop either and the build stays green while the markdown
  quietly loses its list markers and its syntax highlighting.

The token values are still shadcn's `base-nova` preset, which is what
`components.json` and the components under `ui/shadcn` are written against —
but they are now the project's own, the starting point rather than a live
dependency on an upstream preset.

## Adding components

Add more shadcn/ui components from this directory; the CLI routes them into
`@trajs/shadcn` and writes their imports across the workspace boundary:

```bash
pnpm dlx shadcn@latest add <component>
```
