# website

The trajs documentation site, built with
[Fumapress](https://press.fumadocs.dev), the Waku-based site generator on top of
[Fumadocs](https://fumadocs.dev). Pages are Markdown files under `content/`, and
the site is configured in `press.config.tsx`.

Run it from the repository root with `vp run website` (its `vp run dev` alias
runs the same task), or from this directory:

```bash
pnpm run dev     # Fumapress dev server
pnpm run build   # prerendered site into dist/public, Worker into dist/server
pnpm run deploy  # upload the built Worker and assets to Cloudflare
pnpm run start   # serve the build with the Node target instead
```

The package scripts run the `fumapress` CLI directly: `vp dev` and `vp build`
are Vite+'s built-ins, so they would run a plain Vite app and skip the Waku
server Fumapress needs. Use `vp run dev` and `vp run build` so the package
scripts run.

## The landing page

Every page but `/` is a Markdown file under `content/` rendered by the docs
layout. `/` is drawn instead: `src/components/hero/` is the masthead, the
headline, the two calls to action, the lockup and the index, and
`press.config.tsx` renders it under a layout of its own so that the design's
masthead is the page's only navigation. `content/index.mdx` still carries the
title and description the page's head and its Markdown are built from.

The lockup's mark is filled with a shader exported from Figma — `Apricot haze`,
the same fill the design draws the page's ground with. `hero/apricot-haze.ts`
holds the shader (its WGSL is the export's own text, unchanged) and the
parameters of each of the design's four fills; `src/shader-runtime/` is the
runtime that draws them, a copy of
[`@figma/expressive-components`](https://github.com/figma/expressive-components)
with a README of its own saying what was changed. Fills need WebGPU, so a
browser without it shows the page's flat colours and the mark's outline.

The page is laid out in a unit of the design's 1920 × 1080 canvas rather than in
pixels, so it keeps its proportions and fits one screen at any window size; see
the comment at the top of `hero/hero.tsx`.

Its type is served from this package rather than from a font CDN: `app.css`
imports the weights the designs name from `@fontsource`, as the gallery and the
viewer do, so the page fetches nothing from a third party before it paints. The
landing page is set in Poppins — Light for the wordmark, the index and the
prose, Medium for the button, and ExtraLight for the headline, which the design
draws in a lighter build of the family that Google does not ship; the comment
above the headline in `hero/hero.tsx` has the measurements.

## Deploying

The site is a Cloudflare Worker with static assets. `vite.config.ts` names the
Cloudflare adapter because Fumapress otherwise infers it from the build
environment, which Cloudflare's Workers Builds sets and GitHub Actions does not.
A build prerenders every page into `dist/public`, then emits the Worker that
serves the rest — including the `/mcp` endpoint — into `dist/server`, and points
Wrangler at it through `.wrangler/deploy/config.json`.

`wrangler.jsonc` is the project's own Wrangler config, rather than the one the
build would otherwise generate: it pins the Worker name, the trailing-slash
handling, and the compatibility flags. `nodejs_compat` and
`new_module_registry` are both required — Vite 8's rolldown runtime imports
`node:module` and calls `createRequire(import.meta.url)` at module load, and
workerd only defines `import.meta.url` under `new_module_registry`. The build
reuses the file's `name`, compatibility settings and `assets`, and fills in the
Worker entry itself.

`.github/workflows/deploy.yml` runs `pnpm run deploy` after a build, which needs
two repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
Deploying from a machine that has run `wrangler login` needs neither.

The Worker has no domain of its own yet. `tra.js.org` is a js.org subdomain, and
js.org only CNAMEs a subdomain at a third-party host, while a Workers Custom
Domain needs the zone in this Cloudflare account, so the two cannot meet until
the site moves to a domain registered there. In the meantime the site is
reachable at `https://trajs-website.cc-route.workers.dev`, and `site.baseUrl` in
`press.config.tsx` still names `tra.js.org`.

Unlike a static build, this one needs a server for `/api/search` and `/mcp`, so
the site cannot go back to GitHub Pages — a static host would drop both. `pnpm
run start` runs the Node target for that reason, mostly useful for checking the
built app locally.
