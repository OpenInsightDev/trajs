# website

The trajs documentation site, built with
[Fumapress](https://press.fumadocs.dev), the Waku-based site generator on top of
[Fumadocs](https://fumadocs.dev). Pages are Markdown files under `content/`, and
the site is configured in `press.config.tsx`.

## The home page

The home page is the landing page the Figma file draws (`02 · Website`), not a
Markdown page: `press.config.tsx` renders `src/components/landing/` under
`src/layouts/landing.tsx`, a home layout that adds nothing around the design's
own floating header. `content/index.mdx` still owns the `/` route — its
frontmatter is the page's title and description, and its Markdown is what the
site serves to LLMs — but its prose is not part of the rendered page.

`src/app.css` holds the file's design system as Tailwind theme tokens: one per
colour variable (`--color-ink-primary` for `Ink / Primary`, and so on), one per
text style (`--text-hero` for `Type / Display / Hero`, overridden at the 834,
1440 and 1920 board widths), and the boards themselves as breakpoints
(`tablet`, `desktop`, `wide`). The components name the node each block comes
from, so a value can be carried between the file and the page without
translation.

## Theming

The file's `Color` collection has two modes, `Light` and `Dark`, and the page is
drawn in whichever one `<html>` names: `src/app.css` states the light values as
the base and restates the variables under `.dark`, so every token and every
utility built from one follows the attribute. `src/theme.ts` reads that class and
switches it — the header's sun and moon (`225:291`) write the mode, and the
choice is stored under `theme`, which is the key the root layout's load script
already reads before the first paint. A visitor with no stored choice gets the
mode their system asks for; the file's boards are drawn in `Dark`, so that is
also what a fill paints while it has no theme to read.

The mark's pigment and the page's paper are fills from
[`@trajs/ui-shaders`](../shaders), one build per mode: the paper is `Apricot
haze` standing still and the pigment inside the mark is `Apricot haze — drift`,
the same painting on the design's current. Their pigments are the file's
`Effect / Mark` and `Effect / Cloud` variables, stated for both modes in
`src/components/landing/palette.ts` because a fill takes colours as numbers
rather than through CSS. The brand's vectors are inlined from the file's exports
(`src/components/landing/brand-art.tsx`) so their ink is `Ink / Primary` in both
modes.

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
