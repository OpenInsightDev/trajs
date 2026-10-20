# gallery

The trajs design language and the component library as a site: the tokens every
surface is painted with, and the components that paint with them. Built with
[Fumapress](https://press.fumadocs.dev), the same Waku-on-Fumadocs stack as the
documentation site.

```bash
vp run gallery   # from the repository root
```

That task runs this package's `dev` script, which is the `fumapress` CLI. The
same three commands work from this directory as `pnpm run dev`,
`pnpm run build` and `pnpm run start`. `vp dev` would not: it is Vite+'s built-in
and would run a plain Vite app instead of the Waku server Fumapress needs.

## Why it is a package of its own

`ui/website` is the product's documentation, published to the people who _use_
trajs. The gallery is for the people _changing_ the design language or a
component, and its pages mount every component the project has — so it carries
all of `ui/shadcn` and the Tailwind output it needs. Keeping the two apart keeps
that weight, and that audience, out of the published docs.

## What it shows

The **design language** is [`ui/shadcn/styles.css`](../shadcn/styles.css): the
semantic tokens, the `@theme inline` mapping that turns them into Tailwind
utilities, and the base layer that applies them. `content/design/` documents them
by _reading_ them — [`palette.tsx`](src/components/palette.tsx) paints each
swatch with `var(--…)` rather than a copy of the value — so the page cannot
describe a token that has since changed, and it follows the theme switch without
knowing about it.

The **components** are `@trajs/ui-shadcn`'s: the same source the viewer renders
with, and the same one `@trajs/ui-component` maps `effect/ai`'s prompt and response
model onto. A demo imports the component from the package, so a page cannot show
a component that differs from the one that ships.

The **mapping** is `@trajs/ui-component`'s: `content/prompt/` and `content/response/`
carry one page per component, each rendering the real component against a part
written with `effect/ai`'s own constructors, so the mapping is read without a
trajectory, a model or a network. This is the gallery the viewer used to carry at
`#/components`, moved here to be read beside the tokens it paints with and kept
from being two showcases that drift.

## How a page works

Pages are MDX under `content/`, and the demos on them are ordinary React. The
only mechanism is one option in [`press.config.tsx`](press.config.tsx):

```ts
config.adapters(fumadocsMdx({ getMdxComponents: () => mdxComponents }));
```

[`src/components/mdx.ts`](src/components/mdx.ts) is what a page may use without
importing it — `Preview`, `Palette`, `ButtonVariants` — so a page reads like
this, and the component it shows is the component it runs:

```mdx
<Preview>
  <ButtonVariants />
</Preview>
```

Anything else a page needs, it imports itself, exactly like any other React file:

```mdx
import { Button } from "@trajs/ui-shadcn/button";

<Preview>
  <Button variant="outline">New session</Button>
</Preview>
```

Those demos are **server-rendered with the page**, not mounted into it
afterwards. That is the reason for this stack over a Vue-based one: the demos are
in the prerendered HTML, in the search index, and in the Markdown copy of the
page that the site serves to agents. Nothing about a demo is a client-only
afterthought.

The mapping's demos are `"use client"`, because the components they render use
state — a reasoning part folds open, a stream writes itself a part at a time.
Fumapress renders a client component on the server as well, so the demos are
still in the prerendered HTML and the search index; the directive is only what
lets them run in the browser.

## The parts that are easy to get wrong

**`includeProcessedMarkdown` has to stay on.** Fumapress' recommended plugins
include `llms.txt`, which serves every page as Markdown; without the collection's
`postprocess.includeProcessedMarkdown` the build fails at static generation with
`getText('processed') requires ...`.

**The trajs base layer paints the whole page.** `styles.css` ends with
`@layer base { body { @apply bg-background text-foreground } }`, and this site
imports it — which is what puts the demos on the trajs palette, and also means
the documentation chrome's body follows `--background` instead of `--fd-*`.
Fumadocs' own surfaces (sidebar, navbar, cards) still read their own tokens, and
both themes agree because Fumadocs and shadcn both put `.dark` on `<html>`. It is
deliberate, but it is the one place where the two palettes meet.

**Tailwind has to be pointed at the components.** They are copied sources in
other packages, and the markdown a message is read as is written by Streamdown, so
`src/app.css` registers each with its own `@source` line rather than relying on
being reached by an import. Dropping the Streamdown lines leaves the build green
while a message quietly loses its list markers and its syntax highlighting.

**A few components cannot be rendered by the page that shows them.** The
overlays and gestures — a dialog, a hover card, a sheet, a drawer, a sidebar, a
message scroller and a questionnaire — and the toaster, which is raised by a
click, are shown from a `"use client"` demo under `src/components/demos/` rather
than written into the MDX: the dev server renders a page in the server graph, and
these hold state, read the viewport, or reach a class defined over a client
dependency there. The demo module is still rendered on the server, so the demo
stays in the prerendered HTML and the search index. Every other page renders the
component in the page itself.

## Not done yet

There is no deploy configuration: unlike `ui/website`, this package names no
Cloudflare adapter and has no `wrangler.jsonc`, so `pnpm run build` produces a
Node-served build. Deploying it needs that decision — its own Worker, or serving
it out of the documentation site.

The shadcn/ui pages cover every component `@trajs/ui-shadcn` publishes. The mapping
pages under `content/prompt/` and `content/response/` are complete for the
components `@trajs/ui-component` publishes today.
