// `mcpPlugin()` served an MCP server over Streamable HTTP at `/mcp` from the
// Cloudflare Worker, and both are off for now: the site is a directory of
// prerendered files on GitHub Pages, which has no server for that endpoint to
// answer on. Uncomment the import and the plugin below to give it one back.
// import { mcpPlugin } from "@fumapress/ai";
import { Icon } from "@trajs/ui-component";
import { defineDocs } from "fumadocs-mdx/macro";
import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { metaSchema, pageSchema } from "fumapress/adapters/mdx/schema";
import { createDocsLayoutPage } from "fumapress/layouts/docs";
import { createHomeLayoutPage } from "fumapress/layouts/home";
import { createRootLayout } from "fumapress/layouts/root";

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

// The site is read on the dark ground the design draws it on, so that is the one
// a reader is given before they ask for the other: the header's switch (`170:15`)
// and the documentation's own both write the same preference through
// `next-themes`, and once one is written it is what the page is read in.
const Root = createRootLayout({
  providerProps: { theme: { defaultTheme: "dark" } },
});

// The landing page is its own composition — a floating header, a hero and an
// index, in the design's 1920 × 1080 proportions — so it renders under neither
// the docs layout nor the home layout's navbar, which would put a second header
// above the one the page draws. `content/index.mdx` still holds the page's title
// and description, which is what its head and the Markdown the site serves to
// LLMs read; the landing page does not render that copy.
const HeroPage = createHomeLayoutPage<typeof config.$context>({
  layout: ({ children }) => <>{children}</>,
  render: () => ({ body: <Hero /> }),
});

const config = defineConfig({
  // Every route is written out at build time, search included: the site is
  // served as files, so there is no request for a server to answer.
  mode: "static",
  content: docs.toFumadocsSource(),
  renderRoot: Root,
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
    // The canonical address, which a build can name differently: GitHub Pages
    // serves the site from an address of its own until a domain points at it, and
    // the deploy hands `SITE_URL` what it answers on.
    baseUrl: process.env.SITE_URL ?? "https://tra.js.org",
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
          <link rel="icon" href={`${import.meta.env.BASE_URL}favicon.svg`} type="image/svg+xml" />
        </>
      );
    },
  },
});

// The MCP endpoint is off with the Worker that answered it; see the note on the
// import above.
export default config.adapters(fumadocsMdx());
