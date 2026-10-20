import { mcpPlugin } from "@fumapress/ai";
import { Icon } from "@trajs/component";
import { defineDocs } from "fumadocs-mdx/macro";
import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { metaSchema, pageSchema } from "fumapress/adapters/mdx/schema";
import { createDocsLayoutPage } from "fumapress/layouts/docs";
import { createHomeLayoutPage } from "fumapress/layouts/home";

import { Hero } from "./src/components/hero/hero";

const docs = defineDocs({
  dir: "content",
  docs: {
    async: true,
    schema: pageSchema,
    lastModified: true,
    postprocess: { includeProcessedMarkdown: true },
  },
  meta: { schema: metaSchema },
});

const DocsPage = createDocsLayoutPage<typeof config.$context>();

// The landing page is its own composition — a masthead, a hero and an index, in
// the design's 1920 × 1080 proportions — so it renders under neither the docs
// layout nor the home layout's navbar, which would put a second masthead above the
// one the page draws. `content/index.mdx` still holds the page's title and
// description, which is what its head and the Markdown the site serves to LLMs
// read; the landing page does not render that copy.
const HeroPage = createHomeLayoutPage<typeof config.$context>({
  layout: ({ children }) => <>{children}</>,
  render: () => ({ body: <Hero /> }),
});

const config = defineConfig({
  content: docs.toFumadocsSource(),
  renderPage: ({ lang, slugs, page }) =>
    page.url === "/" ? (
      <HeroPage lang={lang} page={page} slugs={slugs} />
    ) : (
      <DocsPage lang={lang} page={page} slugs={slugs} />
    ),
  // The nav carries the mark alone rather than the lockup: at the ~24px a navbar
  // gives it the wordmark's 2% monoline lands under a pixel, and so does the mark
  // at the weight it is drawn at. It is stroked at 4 instead, close to as heavy as
  // the mark's frame takes — the mark sits 2.34 units inside its 146, so a stroke
  // runs out of it at about 4.6.
  defaultLayoutProps: {
    nav: {
      title: <Icon aria-label="trajs" className="h-6 w-auto stroke-[4]" role="img" />,
    },
  },
  site: {
    name: "trajs",
    baseUrl: "https://tra.js.org",
    git: {
      user: "OpenInsightDev",
      repo: "trajs",
      branch: "main",
    },
  },
  // The site's faces are imported by `src/app.css` rather than linked from a font
  // CDN, so the head only carries what the markup cannot: the favicon.
  meta: {
    root() {
      return (
        <>
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        </>
      );
    },
  },
});

export default config
  .adapters(fumadocsMdx())
  // `mcpPlugin()` serves an MCP server at `/mcp` over Streamable HTTP, so the
  // site is deliberately not built in `mode: "static"`: that endpoint needs a
  // running server, which is the Worker the Cloudflare adapter deploys.
  .plugins(mcpPlugin());
