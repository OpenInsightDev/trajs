import { mcpPlugin } from "@fumapress/ai";
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
              src="/Logo-Horizontal.svg"
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
  content: docs.toFumadocsSource(),
  renderPage: ({ lang, slugs, page }) =>
    page.url === "/" ? (
      <HomePage lang={lang} page={page} slugs={slugs} />
    ) : (
      <DocsPage lang={lang} page={page} slugs={slugs} />
    ),
  // The nav carries the mark alone: a lockup's wordmark is a ~2% monoline,
  // whose letters land under a pixel at the ~24px a navbar gives it, and
  // `favicon.svg` is the same mark at the weight that size needs.
  defaultLayoutProps: {
    nav: {
      title: <img src="/favicon.svg" alt="trajs" className="h-6 w-auto dark:invert" />,
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
  meta: {
    root() {
      return (
        <>
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link
            href="https://fonts.googleapis.com/css2?family=Geist:ital,wght@0,100..900;1,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
            rel="stylesheet"
          />
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
