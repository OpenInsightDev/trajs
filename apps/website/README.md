# website

The trajs documentation site, built with [Astro Starlight](https://starlight.astro.build).
It presents the project's features and vision; the pages live in `src/content/docs`.

Run it from the repository root with `vp run website#dev`, or from this directory:

```bash
vp run dev     # Astro dev server
vp run build   # static site into dist/
vp run preview # preview the built site
```

`vp dev` and `vp build` are Vite+'s built-in commands and do not start Astro; use `vp run dev`
and `vp run build` so the package scripts run.
