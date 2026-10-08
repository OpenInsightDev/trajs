# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```

## Documentation

The docs site in `apps/website` presents the project's features and vision. It is
built with [Astro Starlight](https://starlight.astro.build) and lives in
`apps/website/src/content/docs`.

- Start it at the repository root (equivalent to `vp run website#dev`):

```bash
vp run dev
```

- Build the static site into `apps/website/dist`:

```bash
vp run website#build
```

The site is configured for a GitHub Pages project site at
`https://openinsightdev.github.io/trajs/` (`site` and `base` in
`apps/website/astro.config.mjs`), and `.github/workflows/deploy.yml` builds and
publishes it on push to `main`.
