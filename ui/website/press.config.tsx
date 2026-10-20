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

// The docs layout would put a text title and the page actions above the logo,
// so the landing page renders under the navbar-only home layout; the copy stays
// in `content/index.mdx` so the Markdown the site serves to LLMs keeps no JSX.
const HomePage = createHomeLayoutPage<typeof config.$context>({
  async render(page) {
    const body = (await this.getPageBody(page))?.node;
    const { git } = this.siteConfig;

    return {
      body: (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-16 py-14">
          <div className="flex flex-col items-center gap-8 text-center">
            <img
              src={`${import.meta.env.BASE_URL}Logo-Horizontal.svg`}
              alt={page.data.title}
              width={1856}
              height={1147}
              className="h-auto w-96 max-w-full dark:invert"
            />
            {page.data.description ? (
              <p className="max-w-2xl text-balance text-xl text-fd-muted-foreground">
                {page.data.description}
              </p>
            ) : null}
            {/* The repository URL, assembled the way Fumapress assembles its
                own: its helper is not part of the public API. */}
            {git ? (
              <a
                className="inline-flex items-center rounded-md border bg-fd-secondary px-5 py-2.5 text-sm font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
                href={`${git.url}/${git.user}/${git.repo}`}
                rel="noreferrer noopener"
                target="_blank"
              >
                GitHub
              </a>
            ) : null}
          </div>
          <div className="prose mx-auto w-full max-w-2xl">{body}</div>
        </div>
      ),
    };
  },
});

const config = defineConfig({
  // Every route is written out at build time, search included: the site is
  // served as files, so there is no request for a server to answer.
  mode: "static",
  content: docs.toFumadocsSource(),
  renderPage: ({ lang, slugs, page }) =>
    page.url === "/" ? (
      <HomePage lang={lang} page={page} slugs={slugs} />
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
