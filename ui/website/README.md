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
