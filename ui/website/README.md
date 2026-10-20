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
parameters of each of the design's four fills; `hero/hero-fills.tsx` opens the
paper's greys out so its clouds and grain are read at all, paints the ground still
— a page whose paper moves is a page that is watched rather than read — and carries
the mark on the file's animated build, `Apricot haze — drift`, the painting advected
through one current, ported in `hero/apricot-haze-drift.ts` with the six colourways
the design draws it in as `hazeDriftPresets`. A reader who asks for less motion gets
the still painting for the mark too.
`src/shader-runtime/` is the runtime that draws the fills, a copy of
[`@figma/expressive-components`](https://github.com/figma/expressive-components)
with a README of its own saying what was changed. Fills need WebGPU, so a
browser without it shows the page's flat colours and the mark's outline.

The ground is the page's size, which makes it the page's one fill measured in tens
of millions of pixels. So it is drawn into a canvas smaller than the page and
stretched over it — half a canvas pixel for every CSS pixel of the hero, on any
display — which is not visible in a painting of clouds and grain, and is the
difference between 33ms and 16ms a frame at 1920 × 1080. The mark is small enough
to be drawn at its own size.

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

`.github/workflows/deploy.yml` publishes the site to GitHub Pages. The build
prerenders every page into `dist/public` — search included, since `press.config.tsx`
builds in `mode: "static"` — and that directory is what the workflow uploads. A
project site answers under a path of its own, so `actions/configure-pages` reads the
path and address off the repository's Pages settings, and the build takes them as
`SITE_BASE_PATH` and `SITE_URL` (`vite.config.ts`, `press.config.tsx`). Enable Pages
on the repository with "GitHub Actions" as its source before the first run.

Nothing is served on a request any more, so the site has no MCP endpoint: the
`mcpPlugin` import and plugin in `press.config.tsx` are commented out, along with
the Cloudflare adapter in `vite.config.ts` and the `pnpm run deploy` step that
uploaded the Worker. `wrangler.jsonc` and the `deploy` script are kept as they were
for when the Worker comes back; uncomment the three together.

`pnpm run build` on its own builds for `/`, which is what `pnpm run dev` serves.
`pnpm run start` still runs the Node target, mostly useful for checking the built
app locally.
